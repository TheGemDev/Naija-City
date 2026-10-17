// The five-minute heartbeat. Rent, bets, elections, EFCC cases, manhunts and the rest used to be settled lazily,
// whenever some player happened to open the right screen. This runs them on a schedule too, so the world keeps
// moving at 3am and the first player of the morning doesn't pay for a pile of overdue work.

import { paySalaries, settleElections } from './civic';
import { feedStmt } from './feed';
import { gazette } from './gazette';
import { runStateRound } from './state';
import { settleLoot } from './loot';
import { settleGhosts } from './schemes';
import { settleSeasons } from './community';
import { sweep as sweepManhunts } from './crime';
import { settleDueCases } from './efcc';
import { pruneFeed } from './feed';
import { syncForum } from './groups';
import { settleBets } from './fun';
import { sweepGames } from './games';
import { settleHangouts } from './hangout';
import { sweepKids } from './kids';
import { tickMarket } from './market';
import { track } from './metrics';
import { vdmGrumbles } from './news';
import { pruneOldData } from './prune';
import { settle as settleRentals, settleNpcTenants } from './rentals';
import { spawn as spawnPotholes } from './roads';
import { onlineEverywhere } from './shards';
import { pruneSnaps } from './snaps';
import { settleDesignJobs } from './cribs';
import { runShops } from './shops';
import { rollupCfTraffic } from './cfTraffic';
import { settleContracts, settleRackets } from './vice';
import { runDisasters } from './disasters';
import { runNpcs } from './npcs';

export async function runCron(env: Env, ctx: ExecutionContext): Promise<void> {
  const now = Date.now();
  const jobs: [string, () => Promise<unknown>][] = [
    ['rentals', () => settleRentals(env, ctx)],
    ['npc-tenants', () => settleNpcTenants(env, ctx)],
    ['bets', () => settleBets(env, ctx)],
    ['games', () => sweepGames(env, ctx, now)],
    // NPC citizens: arrivals and japa, work and taxes, land, crime, and their votes, before the polls are counted.
    ['npcs', () => runNpcs(env, now)],
    ['elections', () => settleElections(env, now, ctx)],
    // After the elections, so a seat won this minute is paid from this round.
    ['salaries', () => paySalaries(env.DB, now)],
    // The states' hour: the federal cut goes up, bills are paid, roads and lights wear down or are kept up.
    ['states', async () => {
      const notices = await runStateRound(env.DB, now);
      if (!notices.length) return;
      await env.DB.batch(notices.map((n) => feedStmt(env.DB, null, 'politics', n.icon, n.text, n.city)));
      await gazette(env, ctx, notices.map((n) => ({ uid: null, office: null, kind: 'project' as const, icon: n.icon, text: n.text })));
    }],
    // Looting cases the EFCC chair left alone are settled by the old odds.
    ['loot', () => settleLoot(env, ctx, now)],
    // Ghost workers on a state payroll are paid, or audited, once an hour.
    ['ghosts', () => settleGhosts(env, ctx, now)],
    // Elections seat the Government Forum themselves; this catches a seat that changed any other way.
    ['forum', () => syncForum(env.DB, now)],
    ['seasons', () => settleSeasons(env.DB, now)],
    ['hangouts', () => settleHangouts(env.DB, now)],
    // Adopted children whose next alert has come: a push for a parent who is away (worker/kids.ts).
    ['kids', () => sweepKids(env, ctx, now)],
    ['efcc', () => settleDueCases(env.DB)],
    ['manhunts', () => sweepManhunts(env, ctx)],
    ['rackets', () => settleRackets(env, ctx, now)],
    ['contracts', () => settleContracts(env, ctx, now)],
    ['potholes', () => spawnPotholes(env.DB, now)],
    // Floods, fires and windstorms: maybe a new one, the damage of one that just struck, and whoever is caught in one.
    ['disasters', () => runDisasters(env, ctx, now)],
    ['market', () => tickMarket(env.DB, now)],
    // Customers who aren't players buy from players' shops, and shelves with auto-restock on are topped up.
    ['shops', () => runShops(env, ctx, now)],
    ['vdm', () => vdmGrumbles(env.DB, now)],
    // Interior designer jobs (worker/cribs.ts): unanswered offers refunded, keys that ran out, reviews nobody did.
    ['design-jobs', () => settleDesignJobs(env.DB, now)],
  ];
  // Visits come from Cloudflare's own analytics; refresh them in KV on every run (every 5 minutes).
  jobs.push(['visits', () => rollupCfTraffic(env)]);
  // Twitter keeps one real day of posts; an hourly sweep is plenty, the feed queries hide stale ones meanwhile.
  if (new Date(now).getUTCMinutes() < 5) jobs.push(['feed', () => pruneFeed(env.DB, now)]);
  // Snaps last a real day too; this is what deletes the pictures and their messages for good.
  if (new Date(now).getUTCMinutes() < 5) jobs.push(['snaps', () => pruneSnaps(env, now)]);
  // Settled and abandoned rows are swept once a day, in the small hours (04:00 in Kaduna).
  if (new Date(now).getUTCHours() === 3 && new Date(now).getUTCMinutes() < 5) jobs.push(['prune', () => pruneOldData(env.DB, now)]);
  // One after another so the cron never floods D1; one failing job must not stop the rest.
  for (const [name, job] of jobs) {
    const started = Date.now();
    try {
      await job();
      track(env, 'cron_job', { blobs: [name, 'ok'], doubles: [Date.now() - started] });
    } catch (error) {
      console.error(`cron job ${name} failed`, error);
      track(env, 'cron_job', { blobs: [name, 'error'], doubles: [Date.now() - started] });
    }
  }
  const { online, rooms } = await onlineEverywhere(env, true);
  track(env, 'online', { doubles: [online, rooms] });
}
