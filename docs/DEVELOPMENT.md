# Naija City: development guide

A free, multiplayer 3D Nigerian life sim that runs in the browser. Hustle for naira, open a business, build a house, run for Governor, dodge the EFCC and live your Naija story in Kaduna, Abuja, Lagos and Kano with other real players.

Play it at **https://naija.city**.

Built with Vite, React and React Three Fiber on the front, and Cloudflare Workers, D1, Durable Objects, R2 and Queues behind it. Sign-in is Firebase Auth.

## Run it yourself

You need Node 22+, a Cloudflare account (the free plan is enough to start) and a Firebase project for sign-in.

```bash
npm install
cp .env.example .env                    # Firebase web config (public values only)
cp wrangler.example.jsonc wrangler.jsonc  # replaces Naija City's own config
cp .dev.vars.example .dev.vars          # optional Worker secrets for local dev
```

1. **Firebase:** create a project, add a Web app and copy its config into `.env`. Under Authentication, enable **Email/Password** and **Google**, and add your domain to *Authorized domains*. Put the project id in `FIREBASE_PROJECT_ID` in `wrangler.jsonc`.
2. **Cloudflare:** fill in your `account_id` in `wrangler.jsonc`, then create the resources it names and paste their ids back in:

   ```bash
   npx wrangler d1 create naija-city               # → database_id
   npx wrangler kv namespace create STATS_KV       # → kv id
   npx wrangler r2 bucket create naija-media
   npx wrangler queues create naija-jobs
   ```

3. **Run it locally:**

   ```bash
   npm run dev:api   # Worker + local D1 + Durable Objects on :8787 (applies migrations locally)
   npm run dev       # the game on :5180, proxying /api to :8787
   ```

4. **Deploy:** `npm run db:migrate` (remote D1), then `npm run deploy`. Set production secrets with `npx wrangler secret put <NAME>`; `.dev.vars.example` lists them all. Every one is optional: payments, push notifications, the owner dashboard and visit counts each switch off when their secret is missing.

Nothing secret lives in the repo. `.env` and `.dev.vars` hold your own values and are git-ignored. `wrangler.jsonc` is committed with Naija City's own public ids and domains, because Workers Builds deploys straight from git and a deploy without it replaces the Worker with a bare static site, dropping every binding and secret. Secrets go in `npx wrangler secret put`, which survives deploys.

## Project layout

```
public/assets/        3D models, textures, audio (see public/assets/README.md)
src/game/             Game logic — no rendering
  catalog.ts          Needs, furniture + actions, jobs, food prices
  grid.ts             House layout, walls, pathfinding, placement rules
  store.ts            Game state (zustand): time, needs, money, tasks, power, civic stories
  civic.ts            Shared political offices, campaign costs, and election timing
  regions.ts          The four cities (Kaduna, Abuja, Lagos, Kano): names, airports, prisons and airport routes
  stories.ts          Street encounters, choices, and their outcomes
  save.ts             Save/load (localStorage now, cloud later)
  assets.ts           Registry of .glb files
  avatar.ts           Per-frame avatar position (outside React)
  live.ts             Server-wide live events, shared NEPA blackouts, fuel prices
  drive.ts            Driving: keke/okada passengers, checkpoints, the Durbar course
  legacy.ts           Stats, achievements, street reputation, legacy score
  underworld.ts       Crime ladder and motor parks
  gigs.ts             Side-hustle payout limits (checked by the server)
src/three/            3D scene: world, items, avatar, lighting
src/ui/               HTML overlay: HUD, sheets, phone, welcome
```

Strolling from the compound gate can trigger a street story; choices affect needs, good deeds, or notoriety. Signed-in players share 24-hour elections in Phone → Civic for president (14-day term, sets the 0–20% tax rate), Governor of Kaduna (funds Kaduna's roads and fixes its potholes), FCT Minister (runs Abuja; filed for at the Federal Secretariat there), Governor of Lagos (runs Lagos, the third city in `src/game/lagos.ts`; filed for at the State Secretariat in Alausa), Governor of Kano (runs Kano, the fourth city in `src/game/kano.ts`; filed for at the Audu Bako Secretariat), IGP / Inspector-General of Police (sets street patrols and jail terms) and EFCC chair (5 days, sets the fine on arrested thieves and the deadline to report a theft). A new election for an office opens only when it is vacant or in the last day of the term. Guests retain a local governor/president simulation. The president's income tax is taken by the server from wages and side-hustle earnings into a shared treasury (`worker/wallet.ts`); the governor and the FCT Minister each get their own share of the treasury from the president's allocation (Kaduna State, FCT Abuja, police, EFCC, federal palliatives) and spend it on road projects against rivals, contracts awarded to players and palliatives, and can each ban okada in their own city; the president shares palliatives from the federal palliatives share, and the president, governor or minister can grant pardons (free a jailed player), and any office holder can let “a snake swallow” some of it (EFCC may catch them: removed from office and jailed). Campaigns can hold rallies, town halls, hire crowds (who sometimes run off), put up posters (shown on the map) or buy votes (big boost, EFCC sting risk: disqualified, fined, jailed).

Players can rob each other (`worker/crime.ts`, rules in `src/game/crime.ts`). Stand next to someone in a building and tap **🤏 Steal** on their nametag to pick their pocket (5–15% of their cash, max ₦50k), or walk up to a neighbour's house in an estate and tap **🥷 Break in** (10–25% of their cash, max ₦150k, plus one piece of their furniture, sold on the spot). The server checks you are really there (live Room positions) and rolls whether you get away with it: police funding and patrols raise the catch rate. Victims get told who did it and can file a report in Phone → Police: the thief is arrested, pays the money back plus the EFCC fine, and spends the IGP's jail term in a cell. Day/night lighting can be disabled in Phone → Settings.

Kaduna activities include late-night Mai Shayi meals and Central Market snacks, a powered compound water tank with Mai Ruwa deliveries, Barnawa football viewing, and a recurring Hawan Sallah event with a ram you can feed and share. The background music is a generated Afrobeat / Arewa lofi synth (`src/game/audio.ts`), switched from the HUD music pill. Live FM stations are the radio and only play where there is one (`src/game/radio.ts`): a house with a working, powered Hi-Fi Speaker and a station set on it (tap the speaker → Change station, or Phone → Radio KD while at home), and the nightclub. The music steps aside while a radio plays and returns when you leave; phone app icons use bundled SVGs for consistent rendering across devices.

Every new life gets the same start, the Fresh Start (origin id `starter`): ₦300,000 and a small one-room house, no loan, normal work pay. The old draw's starts (Sapa / Gbese, id `almajiri`; LAPO; Nepo Baby; Rich Kid; Dangote Pikin) stay in `src/game/origins.ts` only for lives that already drew one; their next new life is a Fresh Start. A Sapa / Gbese start can use the free wash area in mosques, public toilets at mosques and motor parks, and rest benches at Gamji Gate Park; they can build a home through Gida.

Flights connect four cities, each with its own map, landmarks, places, street stories, live events and government: Kaduna (home, `src/game/city.ts`), Abuja (`src/game/abuja.ts`), Lagos (`src/game/lagos.ts`) and Kano (`src/game/kano.ts`). Kano is the old walled city: the Emir’s Palace and the Kofar Kudu durbar ground, Dala Hill, Kurmi Market, the Kofar Mata dye pits, what is left of the city wall and its gates, Sabon Gari, Nassarawa GRA and Naibawa motor park, with its own events (a Hisbah raid, a mass wedding, a Kannywood premiere, harmattan haze, the groundnut train, the Sallah cloth rush; `src/ui/KanoEvents.ts`, `src/game/kanoStories.ts`). New players are born in one of the four at random. Destination and multiplayer map location persist across saves and keep players in different cities separated.

**The live city** (`src/game/live.ts`, `worker/fun.ts`):

- **Shared events.** Every two real hours a 40-minute event hits the whole server at once: fuel scarcity (fuel 3×, black-market selling, fare surge), a protest at Murtala Square, Durbar on horseback (ride the parade for a prize), a cup final (bet in Phone → KD Gist, settled by the server at full time), a mega owambe, or a grid collapse. NEPA blackouts are shared too: everyone loses light at the same moment.
- **Driving.** Hustle app: rent a keke or okada at Kawo Motor Park and pick up passengers for fares, or drive your own car (WASD / arrows / on-screen pads). Police checkpoints on the main roads ask for “something for the boys”: pay, argue or speed off. Fares are taxed and the motor park’s godfather takes 10% (`src/game/drive.ts`).
- **Owambe.** Weddings at Murtala Square on Saturdays or when you get an invite: blag, bribe or sneak past the bouncer, spray money, eat, and dance for tips in a rhythm game (`src/ui/Owambe.tsx`).
- **Underworld.** The server keeps a crime score (thefts, scams that paid, turf wars, checkpoint escapes): Small-time thief → Area boy → Agbero → Godfather. Agberos can take over a city's motor park (Kawo in Kaduna, Utako in Abuja, Oshodi in Lagos, Naibawa in Kano) and collect dues, at the risk of turf wars and police raids (`src/game/underworld.ts`).
- **Yahoo.** Send another player a scam payment request; the EFCC may catch you on sending, and victims can report you from Messages.
- **Naija Gist.** A shared feed: the server posts robberies, arrests, election results, stings, scandals and big wins; players post and like.
- **Legacy.** 35 achievements, a street-reputation ladder, and a legacy score when you end a life, kept in a hall of fame across lives (`src/game/legacy.ts`). 56 street stories, some with rare 1-in-100 twists, now also trigger on arrival and while driving.

Side-hustle payouts are capped per payout and per real hour by the server (`src/game/gigs.ts`).

The phone’s Flights app shows departures every three in-game hours, booked passengers, commercial seats or private charters, and Economy, Business, and First Class fares. Players must be inside the departure airport 15 in-game minutes before takeoff; missed tickets are forfeited. Flights leave with whoever checks in, with occasional delays and cancellations.

## Social, careers and the shop

Phone apps (all need a signed-in account with a username):

- **Circle** (`src/ui/Community.tsx`, `worker/community.ts`, `worker/hangout.ts`): friends list; crews (₦50k to found, 20 members, season board); **Hangouts** (match night during the cup final, owambe squad, suya night, date night): host one, friends or crew join within 30 minutes, and everyone is paid ₦2k per other attendee (daily cap ₦30k) plus season points; **Love**: ask a friend out, build a bond on date nights, propose (ring ₦150k, refunded if turned down), marry, divorce (₦100k).
- **Goals**: 4 daily and 3 weekly quests (progress is counted by the server from the ledger, feed, messages and bets), two-week seasons with prizes for the top 10. Rules in `src/game/community.ts`.
- **Career and Market** (`src/ui/Career.tsx`, `src/ui/Market.tsx`, `worker/career.ts`, rules in `src/game/career.ts`): train cooking / mechanic / tailoring / trading; job ranks (Trainee → Manager) are earned from shifts counted in the work ledger and raise that job's pay (the wallet's shift check applies the rank multiplier); own a Suya Spot, Provision Store or Keke Fleet: it is open while its shelf has stock, and stock only leaves the shelf when someone buys (no timer). Besides players, customers who aren't players buy on every cron tick (`worker/shops.ts`, tunables in `NPC_SHOP`): each stocked product has a chance set by the business's level, staff, owner skill, place demand, building size, the hour in Nigeria and how its price compares with the normal one, and is paid, taxed and counted exactly like a player's purchase (one push summary an hour, not one per sale). Businesses can list products by Kaduna neighbourhood, set prices within the wholesale-based range, and pay to restock, by hand or with per-product auto-restock (refill at a level, up to a target, from the wallet; migration 0099). Players browse searchable, paginated listings and buy up to 10 units at a time; each purchase atomically transfers money, reduces stock, and applies the product's need benefit. Listings rotate so businesses are not stuck in one permanent global ranking.
- **Strikes in office** (`worker/loot.ts` `removeFromOffice`, `OFFICE_STRIKES` in `src/game/civic.ts`): money crimes by an office holder (looting, embezzling, ghost workers, bags on the jet, the EFCC chair's bribe) are a fine and a public strike; the third costs the seat and a cell. Strikes reset when the seat changes hands. Rigging the election still unseats at once (`worker/efcc.ts`).
- **NPC citizens** (`worker/npcs.ts`, rules in `src/game/npcs.ts`, migration 0116): people who live in the states besides the players, each with a name, job, wallet, honesty, ambition and mood. Every cron tick the ones whose turn has come are paid (wage tax to their state), spend (VAT and sales tax), and may commit a crime (pickpocketing, online fraud, burglary, cutting street-light cables, embezzling, dodging tax; the police catch them by how the stations are kept, fines go federal), do a good deed (donate to the state, fill a pothole, help a neighbour), buy a plot and build a house in the estates (`estate_plots` rows with their `npc:` id), or adopt. They vote in open races at their own minute of the polling hour (`npc_votes`, counted with players' votes), swayed by campaign support and the incumbent's record. Once an hour newcomers arrive while a state is under its target (better-run states draw more; each active player takes a few NPCs' place), and unhappy people move to a better-run state or japa. Their posts are kind `citizen` in the News tab, under `feed.author`. The population counter is on the state's card on the map and in Civic → Treasury. It is chaotic on purpose (migration 0117): each NPC has a quirk (`NPC_TRAITS`: gambler, show-off, gossip, pious, party, stingy, hothead, hustler, dreamer) that bends their spending, crime, posting and japa; wild things happen to them at random (`NPC_WILD`: betting jackpots, kidnappings, village people, sackings, promotions, pastor scams, visa lottery, omo onile, house fires, wrongful arrests, chieftaincy titles...); a state can catch a craze for a few hours (`NPC_CRAZES`: crime wave, japa rush, land rush, crypto crash, baby boom, fuel scarcity, returnee wave, crusade, owambe season, betting fever), shown on its card; and every tick NPCs reply to recent posts (players' tweets too), fire back at each other and leave likes (`NPC_REPLIES`). Every NPC who ever arrived is added to the phone's "plays" count (`civic_policies.npc_total`).
- **Top-up** (`src/game/shop.ts`, `worker/shop.ts`): real-money naira packs paid through [Bachs](https://docs.bachs.io). Edit prices in `src/game/shop.ts`.

### Bachs setup

```bash
npx wrangler secret put BACHS_API_KEY          # sk_sandbox_... for testing, sk_live_... for production
npx wrangler secret put BACHS_WEBHOOK_SECRET   # the endpoint signing secret from the Bachs developer portal
```

Set `BACHS_BASE_URL` in `wrangler.jsonc` `vars` to `https://api.bachs.io` for production (it defaults to the sandbox). In the Bachs portal, add a webhook endpoint pointing at `https://<your-domain>/api/shop/webhook` and subscribe it to `collection.succeeded`. The wallet is only credited by a signature-verified webhook whose reference, currency (NGN) and amount match the order; the redirect back to the game is never trusted. In `.dev.vars` for local `wrangler dev`, use the same names.

Run `npm run db:migrate` (including migration 0027 for the player marketplace and 0084 for Kano’s government) before deploying.

## Browser notifications

Players can opt in from Phone → Settings. Web Push alerts are limited to incoming payments and house, visit, or owambe invitations; direct messages and public lobby activity do not trigger device notifications. Notifications require HTTPS (localhost works for development), browser permission, and a configured VAPID key pair. Alerts that land together are grouped: every race opening (or closing) in a tick is one election push and one toast; government notices push at most once every two hours (`GAZETTE_PUSH_GAP_MS` in `worker/gazette.ts`, migration 0119) with a count of the ones in between; NPC tenants moving in or out are one note per landlord a tick, and children's alerts one push per parent a sweep. In the game, one gazette banner waits behind the one showing (with "+N more") and a toast already on screen isn't repeated.

Generate a VAPID key pair locally and configure the Worker secrets (use a real contact email for the subject):

```bash
node scripts/generate-vapid-keys.mjs
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npm run db:migrate
npm run deploy
```

Paste the matching generated values when Wrangler prompts for the public and private keys. Set `VAPID_SUBJECT` to a value such as `mailto:you@example.com`. Keep the private key out of source control. For local `wrangler dev`, put these values in `.dev.vars` (which must remain untracked). iPhone and iPad users need to add the game to their Home Screen before browser push is available. Each signed-in account can register up to five devices; expired browser subscriptions are removed automatically.

## Backend

Live at **https://naija.city** (the old domain https://kaduna.life still works).

**Share links:** `/u/<username>` opens a player's chat, `/b/<region>/<slot>` walks you to a plot in an estate. The Worker serves the game page with link-preview tags for these paths (`worker/share.ts`); the game follows the link after sign-in (`src/net/deeplink.ts`). Public JSON: `GET /api/profile/<username>`, `GET /api/plot/<region>/<slot>`.

- **Sign-in:** Firebase Auth, email/password and Google — `src/net/firebase.ts`. Firebase is used for identity only.
- **Worker** (`worker/`): serves the built game from `dist/` and handles `/api/*`. Verifies Firebase ID tokens against Google's public keys (`worker/auth.ts`).
- **D1** (binding `DB`): player saves, wallets, estates, and shared civic elections/policies (`migrations/`). One `SaveData` blob per player; elected offices are server-shared.
- **Durable Object** `Room` (`worker/room.ts`): live multiplayer over WebSocket. One room (`kaduna`); each player streams position + area. Homes are private, so players only see each other in the city. Includes chat bubbles.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/save` | → `SaveData` or `404` |
| `PUT` | `/api/save` | `SaveData` → `{ ok, savedAt }`; rejects bad shapes and impossible money jumps |
| `DELETE` | `/api/save` | wipe cloud save |
| `GET` | `/api/me` | → `{ uid, username }` (`username` is null until claimed) |
| `POST` | `/api/username` | `{ username }` → claim; unique, 3–15 of `a-z 0-9 _`, stored lowercase |
| `GET` | `/api/players?q=` | username prefix search |
| `GET` | `/api/inbox` | conversations with last message + unread count |
| `GET` | `/api/messages/:uid` | thread with a player (marks it read) |
| `POST` | `/api/messages` | `{ to, text }` |
| `POST` | `/api/pay` | `{ to, amount, note?, ref? }` → debits sender's stored save; `ref` settles a request |
| `POST` | `/api/request` | `{ to, amount, note? }` |
| `POST` | `/api/request/:id/decline` | |
| `POST` | `/api/claim` | collect money sent to you (credits stored save, returns payments to add locally) |
| `POST` | `/api/steal` | `{ target, kind: 'pickpocket' \| 'burglary', slot? }` → `{ crime, balance }`; checked against live positions |
| `GET` | `/api/police` | thefts against you and by you, your jail time, the laws in force |
| `POST` | `/api/police/report/:id` | arrest the thief: restitution, fine, jail |
| `GET` | `/api/wallet` | → `{ balance }` |
| `POST` | `/api/wallet/events` | `{ events: [{ id, kind, ref, amount }] }` → `{ balance, accepted, rejected }` |
| `POST` | `/api/wallet/reset` | new life → origin-specific starting balance (refilling below that: once per 24h) |
| `GET` / `POST` | `/api/civic` | shared election board, candidate registration/campaign events, votes, and elected policy changes |
| `GET` | `/api/forbes` | → `{ players: [{ uid, username, name, balance }] }` (top 50 richest players; `?age=u20` or `?age=u30` keeps only players under that age) |
| `GET` | `/api/push/key` | public VAPID key for browser subscription |
| `PUT` / `DELETE` | `/api/push/subscribe` | signed-in device push-subscription registration/removal |
| `GET` | `/api/live` | current live event, my bets, recent cup-final results (settles finished finals) |
| `POST` | `/api/bet` | `{ pick: 'home' \| 'draw' \| 'away', stake }` during a cup final's betting window |
| `GET` / `POST` | `/api/feed` | Kaduna Gist feed (`?before=`); post `{ text }` (one a minute) or `{ achievement }` |
| `POST` | `/api/feed/:id/like` | toggle a like |
| `POST` | `/api/scam` | `{ to, template }` → payment request in their inbox, or caught by the EFCC |
| `GET` | `/api/scams` | my scams and how they went |
| `POST` | `/api/scam/report/:messageId` | victim reports a request to the EFCC |
| `GET` | `/api/underworld` | my crime score and tier, motor parks and dues |
| `POST` | `/api/underworld/claim` · `/collect` · `/escape` | take a park (settle or turf war), collect dues, log a checkpoint escape |
| `GET` (WS) | `/api/room/kaduna?token=` | multiplayer socket; also delivers DMs/payments live (`dm`, `msg-update`) |

All calls send `Authorization: Bearer <Firebase ID token>`. Players are identified by Firebase uid everywhere; the @username is the public handle.

**Money is server-authoritative** (`worker/wallet.ts`, tables `wallets` + `ledger`). The game still changes money instantly, but every change is queued as an event (`kind`: work / sell / buy / spend) and sent to `POST /api/wallet/events`. Spending is always accepted; earnings are checked against `src/game/catalog.ts` (job pay ×1.4 max, at most one shift per ~140s of real time, sells only for items bought or in the drawn origin's starter set, at half price). The Sapa / Gbese start can carry a negative balance; income pays down that debt before reaching zero. The client shows `server balance + unacknowledged events` (`src/net/wallet.ts`). Events are idempotent, so retries are safe. The `money` field in saves is ignored. A new wallet is seeded from the player's first save, capped at ₦500k.

**Other verified progress** (`worker/progress.ts`): on every save upload the server caps `knowledge` at what the fastest study action could have produced in the real time since it was last verified (it gates job pay), and removes furniture the player doesn't own (starter set in `src/game/defaults.ts` + bought − sold since their last new life). Corrections are returned as `corrected` and applied by the client. Money events are sent before each save so new purchases count.

**Offline:** if a signed-in player starts without a connection, money changes are queued in localStorage and the game retries; on reconnect it loads the wallet, sends the queue, then uploads the save.

**Money between players:** `/api/pay` debits the sender, credits the recipient, writes both ledger rows and posts the message in one D1 transaction. The pay message stays `pending` until the recipient's game acknowledges it via `/api/claim` (for the toast + bank entry).

```bash
npm run dev:api   # wrangler dev on :8787 (local D1 + Durable Object)
npm run dev       # vite on :5180, proxies /api (incl. WebSockets) to :8787
npm run db:migrate  # apply migrations to the remote D1
npm run deploy      # build + wrangler deploy
```

Each build embeds its Git commit SHA. The game compares it with the deployed build when a player opens the game or returns to it, and offers a refresh if the deployed commit differs; it does not poll every minute.

## Contributing

Issues and pull requests are welcome. Keep changes small and focused, run `npm run build` (it type-checks the game and the Worker) before opening a PR, and never commit real keys: they belong in `.env`, `.dev.vars` or `wrangler secret`.

## Licence

Naija City is free software under the [GNU Affero General Public License v3.0](../LICENSE). You can use, study, change and share it. If you run a modified version as an online service, you must offer its source code to your players under the same licence.

3D models, textures and audio under `public/assets/` keep their own licences, listed in `public/assets/CREDITS.md`.

Naija City is its own game and is not affiliated with any other game. The "Naija City" name and logo identify the official game. If you run a public fork, please give it your own name and logo.
