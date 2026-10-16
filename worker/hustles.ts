// Side money the server pays out itself (rules in src/game/hustles.ts): the daily check-in, freelance gigs on the
// phone, the farm plot outside town and referral bonuses (migrations/0104_hustles.sql).
//
// Nothing here trusts the client's numbers. A freelance gig is made on the server from a seed and its hand-in is
// marked here; a harvest is priced from when the server saw it planted; a check-in pays once per Lagos day; an
// invite pays once its friend has really worked. Every payout goes through the wallet ledger with a client id of its
// own, so a retried request never pays twice.

import type { FirebaseUser } from './auth';
import { applyStmts, getBalance, taxOf, treasuryStmts } from './wallet';
import { knowledgeNow, loadState } from './clock';
import { loadPolicy } from './policy';
import { homeLaws } from './state';
import { jailedUntil } from './crime';
import {
  CROPS, DAILY_REWARDS, FARM, FREELANCE, FREELANCE_RULES, REFERRAL, cropPrice, dailyReward, dayEnd, dayNo, dayStart, freelanceBrief, freelanceEarned,
  freelanceMinMs, freelancePay, freelanceScore, harvestValue, nextStreak, publicBrief, type CropId, type FreelanceKind,
} from '../src/game/hustles';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

const WEEK_MS = 7 * 86_400_000;

/** Income tax on a hustle payout (the president's rate plus the home state's), the same as on wages (worker/wallet.ts). */
async function taxRate(db: D1Database, uid: string) {
  const policy = await loadPolicy(db);
  return (policy?.taxRate ?? 0) + (await homeLaws(db, uid)).incomeTax;
}

/** Pay `amount` once under `clientId`, less income tax when `taxed`. */
async function payOut(db: D1Database, uid: string, clientId: string, kind: string, ref: string, amount: number, taxed: boolean) {
  const tax = taxed ? taxOf(amount, await taxRate(db, uid)) : 0;
  await db.batch([
    ...applyStmts(db, uid, clientId, kind, ref, amount),
    ...(tax > 0 ? treasuryStmts(db, uid, `tax:${clientId}`, 'tax', 'state', tax) : []),
  ]);
  return amount - tax;
}

/* ---------- State ---------- */

interface FreelanceRow { id: string; uid: string; kind: FreelanceKind; seed: number; pay: number; started_at: number; done_at: number | null }
interface PlotRow { slot: number; crop: CropId | null; planted_at: number | null }

const shiftsWorked = async (db: D1Database, uid: string) =>
  (await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE uid = ? AND kind = 'work' AND amount > 0").bind(uid).first<{ n: number }>())?.n ?? 0;

/** Invites whose friend has worked enough shifts and whose bonus is unpaid, and what has been paid this week. */
async function referralState(db: D1Database, uid: string, now: number) {
  const [ready, pending, week, mine] = await Promise.all([
    db.prepare(
      `SELECT s.uid FROM referral_signups s JOIN referral_links l ON l.code = s.code
       WHERE l.owner_uid = ?1 AND s.uid != ?1 AND s.rewarded_at IS NULL
         AND (SELECT COUNT(*) FROM ledger g WHERE g.uid = s.uid AND g.kind = 'work' AND g.amount > 0) >= ?2
       LIMIT 20`,
    ).bind(uid, REFERRAL.shifts).all<{ uid: string }>(),
    db.prepare(
      `SELECT COUNT(*) AS n FROM referral_signups s JOIN referral_links l ON l.code = s.code
       WHERE l.owner_uid = ?1 AND s.uid != ?1 AND s.rewarded_at IS NULL`,
    ).bind(uid).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE uid = ? AND kind = 'bonus' AND ref = 'referral' AND created_at > ?").bind(uid, now - WEEK_MS).first<{ n: number }>(),
    db.prepare('SELECT welcome_at FROM referral_signups WHERE uid = ?').bind(uid).first<{ welcome_at: number | null }>(),
  ]);
  const shifts = mine ? await shiftsWorked(db, uid) : 0;
  return {
    ready: ready.results.map((r) => r.uid),
    waiting: Math.max(0, (pending?.n ?? 0) - ready.results.length),
    paidThisWeek: week?.n ?? 0,
    /** This player came in through someone's link: their own welcome bonus. */
    welcome: !mine ? 'none' as const : mine.welcome_at ? 'paid' as const : shifts >= REFERRAL.shifts ? 'ready' as const : 'pending' as const,
    shifts,
  };
}

async function view(db: D1Database, uid: string, now: number) {
  const day = dayNo(now);
  const [daily, done, active, plots, referral] = await Promise.all([
    db.prepare('SELECT last_day, streak, best FROM hustle_daily WHERE uid = ?').bind(uid).first<{ last_day: number; streak: number; best: number }>(),
    db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(earned), 0) AS earned FROM freelance_tasks WHERE uid = ? AND started_at >= ?').bind(uid, dayStart(day)).first<{ n: number; earned: number }>(),
    db.prepare('SELECT * FROM freelance_tasks WHERE uid = ? AND done_at IS NULL AND started_at > ? ORDER BY started_at DESC LIMIT 1').bind(uid, now - FREELANCE_RULES.expireMs).first<FreelanceRow>(),
    db.prepare('SELECT slot, crop, planted_at FROM farm_plots WHERE uid = ? ORDER BY slot').bind(uid).all<PlotRow>(),
    referralState(db, uid, now),
  ]);
  const claimed = daily?.last_day === day;
  const streak = claimed ? daily!.streak : nextStreak(daily?.last_day ?? null, daily?.streak ?? 0, day);
  return {
    now,
    day,
    dayEnds: dayEnd(day),
    daily: { claimed, streak, best: daily?.best ?? 0, reward: dailyReward(streak), week: DAILY_REWARDS },
    freelance: {
      done: done?.n ?? 0,
      earned: done?.earned ?? 0,
      perDay: FREELANCE_RULES.perDay,
      knowledge: knowledgeNow(await loadState(db, uid)),
      active: active ? taskView(active) : null,
    },
    farm: {
      plots: plots.results.map((p) => ({ slot: p.slot, crop: p.crop, plantedAt: p.planted_at })),
      prices: Object.fromEntries(Object.keys(CROPS).map((c) => [c, cropPrice(c as CropId, day)])),
    },
    referral,
  };
}

/** A gig as the phone sees it: the brief without its answers (the seed would give them away). */
const taskView = (t: FreelanceRow) => {
  const brief = freelanceBrief(t.kind, t.seed);
  return { id: t.id, kind: t.kind, pay: t.pay, startedAt: t.started_at, minMs: freelanceMinMs(brief), expiresAt: t.started_at + FREELANCE_RULES.expireMs, brief: publicBrief(brief) };
};

/* ---------- Requests ---------- */

export async function handleHustles(req: Request, env: Env, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/hustle')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  if (path === '/api/hustle' && req.method === 'GET') return json(await view(db, me, now));
  if (req.method !== 'POST') return err(405, 'Method not allowed');
  const b = (await req.json().catch(() => null)) as { kind?: string; id?: string; answer?: unknown; slot?: number; crop?: string } | null;

  // Daily check-in: once per Lagos day, more for every day in a row.
  if (path === '/api/hustle/daily') {
    const day = dayNo(now);
    const row = await db.prepare('SELECT last_day, streak, best FROM hustle_daily WHERE uid = ?').bind(me).first<{ last_day: number; streak: number; best: number }>();
    if (row?.last_day === day) return err(409, 'You already checked in today. Come back tomorrow');
    const streak = nextStreak(row?.last_day ?? null, row?.streak ?? 0, day);
    const reward = dailyReward(streak);
    // Only one request can move the day on; the ledger id makes the payment once per day whatever happens.
    const [moved] = await db.batch([
      db.prepare(
        `INSERT INTO hustle_daily (uid, last_day, streak, best, claimed_at) VALUES (?1, ?2, ?3, ?3, ?4)
         ON CONFLICT(uid) DO UPDATE SET last_day = ?2, streak = ?3, best = MAX(best, ?3), claimed_at = ?4 WHERE hustle_daily.last_day < ?2`,
      ).bind(me, day, streak, now),
    ]);
    if (!moved.meta.changes) return err(409, 'You already checked in today. Come back tomorrow');
    await payOut(db, me, `daily:${day}`, 'bonus', 'daily', reward, false);
    return json({ reward, streak, balance: await getBalance(db, me), state: await view(db, me, now) });
  }

  // Freelance: take a gig. One at a time; starting another drops the one in hand.
  if (path === '/api/hustle/freelance/start') {
    const kind = b?.kind && Object.hasOwn(FREELANCE, b.kind) ? (b.kind as FreelanceKind) : null;
    if (!kind) return err(400, 'Pick a kind of gig');
    if (await jailedUntil(db, me)) return err(403, 'No data in a police cell');
    const knowledge = knowledgeNow(await loadState(db, me));
    if (knowledge < FREELANCE[kind].minKnowledge) return err(403, `${FREELANCE[kind].label} needs 📚${FREELANCE[kind].minKnowledge} knowledge`);
    const day = dayNo(now);
    const started = await db.prepare('SELECT COUNT(*) AS n FROM freelance_tasks WHERE uid = ? AND started_at >= ?').bind(me, dayStart(day)).first<{ n: number }>();
    if ((started?.n ?? 0) >= FREELANCE_RULES.perDay) return err(429, `That’s ${FREELANCE_RULES.perDay} gigs today. Clients are back tomorrow`);
    const [seed] = crypto.getRandomValues(new Uint32Array(1));
    const id = crypto.randomUUID();
    const pay = freelancePay(kind, knowledge);
    await db.batch([
      // Old gigs are only kept for the day's count.
      db.prepare('DELETE FROM freelance_tasks WHERE uid = ? AND started_at < ?').bind(me, now - 2 * 86_400_000),
      db.prepare('UPDATE freelance_tasks SET done_at = ?2, earned = 0 WHERE uid = ?1 AND done_at IS NULL').bind(me, now),
      db.prepare('INSERT INTO freelance_tasks (id, uid, kind, seed, pay, started_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, me, kind, seed, pay, now),
    ]);
    return json({ task: taskView({ id, uid: me, kind, seed, pay, started_at: now, done_at: null }) });
  }

  // Freelance: hand it in. Marked here from the brief the seed makes; too quick or too late pays nothing.
  if (path === '/api/hustle/freelance/submit') {
    const task = typeof b?.id === 'string' ? await db.prepare('SELECT * FROM freelance_tasks WHERE id = ? AND uid = ?').bind(b.id, me).first<FreelanceRow>() : null;
    if (!task || task.done_at) return err(404, 'That gig is gone');
    const brief = freelanceBrief(task.kind, task.seed);
    const took = now - task.started_at;
    if (took < freelanceMinMs(brief)) return err(400, 'Too fast. The client can tell it was rushed');
    const late = took > FREELANCE_RULES.expireMs;
    const score = late ? 0 : freelanceScore(brief, b?.answer);
    const earned = freelanceEarned(task.pay, score);
    const marked = await db.prepare('UPDATE freelance_tasks SET done_at = ?3, score = ?4, earned = ?5 WHERE id = ?1 AND uid = ?2 AND done_at IS NULL').bind(task.id, me, now, score, earned).run();
    if (!marked.meta.changes) return err(409, 'Already handed in');
    const net = earned > 0 ? await payOut(db, me, `freelance:${task.id}`, 'gig', 'freelance', earned, true) : 0;
    return json({ score, earned, net, late, answer: brief.kind === 'code' ? brief.snippets!.map((s) => s.bug) : brief.kind === 'design' ? brief.hues : brief.text, balance: await getBalance(db, me), state: await view(db, me, now) });
  }

  // Farm: lease the next plot (three at most).
  if (path === '/api/hustle/farm/lease') {
    const { results } = await db.prepare('SELECT slot FROM farm_plots WHERE uid = ?').bind(me).all<{ slot: number }>();
    const slot = results.length;
    if (slot >= FARM.plots.length) return err(409, 'You already farm every plot the village chief will lease you');
    const cost = FARM.plots[slot];
    if ((await getBalance(db, me)) < cost) return err(402, `The lease is ${cost.toLocaleString('en-NG')} naira`);
    const [made] = await db.batch([
      db.prepare('INSERT INTO farm_plots (uid, slot, leased_at) VALUES (?, ?, ?) ON CONFLICT(uid, slot) DO NOTHING').bind(me, slot, now),
    ]);
    if (!made.meta.changes) return err(409, 'Already leased');
    await db.batch(applyStmts(db, me, `farmlease:${slot}`, 'spend', 'farm_lease', -cost));
    return json({ slot, cost, balance: await getBalance(db, me), state: await view(db, me, now) });
  }

  // Farm: plant an empty plot.
  if (path === '/api/hustle/farm/plant') {
    const crop = b?.crop && Object.hasOwn(CROPS, b.crop) ? (b.crop as CropId) : null;
    const slot = Number.isInteger(b?.slot) ? b!.slot! : -1;
    if (!crop) return err(400, 'Pick a crop');
    const cost = CROPS[crop].seed;
    if ((await getBalance(db, me)) < cost) return err(402, 'Not enough money for seeds');
    const sown = await db.prepare('UPDATE farm_plots SET crop = ?3, planted_at = ?4 WHERE uid = ?1 AND slot = ?2 AND crop IS NULL').bind(me, slot, crop, now).run();
    if (!sown.meta.changes) return err(409, 'That plot is not yours, or something is already growing on it');
    await db.batch(applyStmts(db, me, `farmseed:${slot}:${now}`, 'spend', 'farm_seed', -cost));
    return json({ balance: await getBalance(db, me), state: await view(db, me, now) });
  }

  // Farm: harvest a ripe plot and sell at today's market price (a crop left too long has rotted).
  if (path === '/api/hustle/farm/harvest') {
    const slot = Number.isInteger(b?.slot) ? b!.slot! : -1;
    const plot = await db.prepare('SELECT slot, crop, planted_at FROM farm_plots WHERE uid = ? AND slot = ?').bind(me, slot).first<PlotRow>();
    if (!plot?.crop || !plot.planted_at || !Object.hasOwn(CROPS, plot.crop)) return err(404, 'Nothing is growing there');
    const value = harvestValue(plot.crop, plot.planted_at, now);
    if (!value) return err(409, 'Still growing');
    const cleared = await db.prepare('UPDATE farm_plots SET crop = NULL, planted_at = NULL WHERE uid = ? AND slot = ? AND planted_at = ?').bind(me, slot, plot.planted_at).run();
    if (!cleared.meta.changes) return err(409, 'Already harvested');
    const net = await payOut(db, me, `farm:${slot}:${plot.planted_at}`, 'gig', 'farm', value, true);
    const rotten = now - plot.planted_at - CROPS[plot.crop].growMs > FARM.rotMs;
    return json({ crop: plot.crop, value, net, rotten, balance: await getBalance(db, me), state: await view(db, me, now) });
  }

  // Referrals: the inviter's bonus for each friend who has worked their shifts, and the friend's welcome bonus.
  if (path === '/api/hustle/referral/claim') {
    const r = await referralState(db, me, now);
    let paid = 0;
    let count = 0;
    for (const friend of r.ready.slice(0, Math.max(0, REFERRAL.perWeek - r.paidThisWeek))) {
      const marked = await db.prepare('UPDATE referral_signups SET rewarded_at = ? WHERE uid = ? AND rewarded_at IS NULL').bind(now, friend).run();
      if (!marked.meta.changes) continue;
      await payOut(db, me, `refer:${friend}`, 'bonus', 'referral', REFERRAL.reward, false);
      paid += REFERRAL.reward;
      count++;
    }
    let welcome = 0;
    if (r.welcome === 'ready') {
      const marked = await db.prepare('UPDATE referral_signups SET welcome_at = ? WHERE uid = ? AND welcome_at IS NULL').bind(now, me).run();
      if (marked.meta.changes) {
        await payOut(db, me, 'welcome:referral', 'bonus', 'welcome', REFERRAL.welcome, false);
        welcome = REFERRAL.welcome;
      }
    }
    if (!paid && !welcome) return err(409, r.ready.length ? `That’s ${REFERRAL.perWeek} invite bonuses this week. The rest wait for next week` : 'Nothing to claim yet');
    return json({ paid, count, welcome, balance: await getBalance(db, me), state: await view(db, me, now) });
  }

  return err(404, 'Not found');
}
