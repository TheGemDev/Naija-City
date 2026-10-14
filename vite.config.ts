import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import pkg from './package.json';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const buildCommit = process.env.GITHUB_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.WORKERS_CI_COMMIT_SHA ?? git('rev-parse', 'HEAD');
if (!/^[\da-f]{7,64}$/i.test(buildCommit)) throw new Error('A valid Git commit SHA is required to identify this game build');
// The commit alone is not enough: deploying uncommitted changes would keep the same id, and phones would never see an update.
const buildId = `${buildCommit}-${Date.now().toString(36)}`;

/** The number of commits so far, which goes up by one with every push. Null when the history is not all here. */
function commitCount(): number | null {
  try {
    // Build servers clone only the newest commits, which would count as 1 every time, so fetch the rest first.
    if (git('rev-parse', '--is-shallow-repository') === 'true') git('fetch', '--unshallow', '--quiet');
    if (git('rev-parse', '--is-shallow-repository') === 'true') return null;
    return Number(git('rev-list', '--count', 'HEAD'));
  } catch {
    return null;
  }
}

// What players see on the title screen, like "v0.1.267 (6faa281)". The first two numbers come from package.json.
const count = commitCount();
const shortCommit = buildCommit.slice(0, 7);
const buildVersion = count ? `v${pkg.version.split('.').slice(0, 2).join('.')}.${count} (${shortCommit})` : shortCommit;

/** The .glb model loader and its decoders: only src/three/GlbModel.tsx uses them. */
const GLTF = /three-stdlib[\\/](loaders|libs)[\\/]|@react-three[\\/]drei[\\/]core[\\/]Gltf\./;

export default defineConfig({
  plugins: [
    react(),
    {
      // A build with no Firebase config boots to an "invalid-api-key" error page. Fail the build instead, so the last good deploy stays live.
      name: 'naija-require-firebase',
      configResolved(config) {
        if (config.command !== 'build') return;
        const missing = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID'].filter((k) => !config.env[`VITE_FIREBASE_${k}`]);
        if (missing.length) throw new Error(`Missing build variables: ${missing.map((k) => `VITE_FIREBASE_${k}`).join(', ')}. Set them in .env or the build environment.`);
      },
    },
    {
      name: 'kaduna-build-commit',
      transformIndexHtml(html) {
        return html.replace('__KADUNA_BUILD_COMMIT__', buildId).replace('__KADUNA_BUILD_VERSION__', buildVersion);
      },
    },
    {
      // The page's own script is tiny, but the browser only learns about the game's big files after fetching and
      // running it: a second or more of idle line on 3G. This starts them from the page itself.
      name: 'kaduna-early-game',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          const chunks = Object.values(ctx.bundle ?? {}).filter((file) => file.type === 'chunk');
          const game = chunks.find((chunk) => chunk.facadeModuleId?.endsWith('/src/App.tsx'));
          if (!game) return html;
          const files = new Set<string>();
          const add = (name: string) => {
            if (files.has(name)) return;
            files.add(name);
            chunks.find((chunk) => chunk.fileName === name)?.imports.forEach(add);
          };
          add(game.fileName);
          // Minus what the page already asks for (its own script and React).
          const early = [...files].filter((name) => !html.includes(name));
          // The stats page never loads the game: the same test as statsOnly in src/main.tsx.
          const script = `if(!(location.hostname.startsWith('stats.')||location.pathname==='/stats'))${JSON.stringify(early)}.forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href='/'+f;document.head.appendChild(l)})`;
          return { html, tags: [{ tag: 'script', children: script, injectTo: 'head' }] };
        },
      },
    },
  ],
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than the game. In their own files they stay cached on
        // players' phones across deploys, so an update only re-downloads the game code.
        // A group also takes whatever its files import, unless a group with a higher priority has it already.
        codeSplitting: {
          groups: [
            { name: 'react', priority: 9, test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/ },
            { name: 'firebase', priority: 8, test: /node_modules[\\/](firebase|@firebase)/ },
            { name: 'three', priority: 7, test: (id: string) => /node_modules[\\/](three|@react-three|three-stdlib|camera-controls|maath|troika)/.test(id) && !GLTF.test(id) },
            // Not needed to start the game, and fetched on their own later: the .glb model loader, the colour
            // emoji and crash reporting. Below the libraries they import, or they would pull those in with them.
            { name: 'gltf', priority: 4, test: GLTF },
            { name: 'emoji', priority: 4, test: /node_modules[\\/]@iconify[\\/]|src[\\/]ui[\\/]noto(Set|Data)\./ },
            { name: 'sentry', priority: 4, test: /node_modules[\\/]@sentry[\\/]/ },
            { name: 'vendor', priority: 1, test: /node_modules/ },
          ],
        },
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 5180,
    host: true,
    // API + multiplayer run in `wrangler dev` (npm run dev:api).
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
