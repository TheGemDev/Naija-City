// Race tests for the money routes: many requests at once from one player, then check nothing was paid twice.
// They run against a local copy of the Worker with its own empty database (entry.ts), never the real one.
//
//   npx wrangler d1 migrations apply kaduna-life-race --local -c scripts/race/wrangler.jsonc --persist-to .wrangler/race
//   npx wrangler dev -c scripts/race/wrangler.jsonc --port 8799 --persist-to .wrangler/race
//   node scripts/race/race.mjs [test names]        N=20 requests per burst, DELAY=15 ms of pretend D1 latency
//
// Each test uses fresh players and says what a correct server allows.
const BASE = process.env.BASE ?? 'http://localhost:8799';
const RUN = Date.now().toString(36);
const N = Number(process.env.N ?? 20);
let seq = 0;
const newUid = (tag) => `race-${RUN}-${tag}-${seq++}`;
const rid = () => `r${RUN}${seq++}`;

async function api(uid, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'x-uid': uid, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}
const sql = async (q, args = []) => (await fetch(BASE + '/__sql', { method: 'POST', body: JSON.stringify({ sql: q, args }) })).json();
const balance = async (uid) => (await api(uid, 'GET', '/api/wallet')).data.balance;
const events = (uid, evs) => api(uid, 'POST', '/api/wallet/events', { events: evs });
/** Open the connections first, so the real burst arrives together instead of one request ahead of the rest. */
const warm = (n) => Promise.all(Array.from({ length: n }, () => fetch(BASE + '/__probe').then((r) => r.text())));
const parallel = async (n, fn) => { await warm(n); return Promise.all(Array.from({ length: n }, (_, i) => fn(i))); };
const count = (rs, pred) => rs.filter(pred).length;

/** What one ginger farm unit costs to buy and pays to liquidate right now (worker/wallet.ts checks both). */
async function gingerPrices() {
  const [q] = await sql("SELECT mult, prev FROM market_now WHERE inv_id = 'ginger_farm'");
  const { mult = 1, prev = 1 } = q ?? {};
  return { buy: Math.round(80_000 * Math.max(mult, prev)), sell: Math.round(80_000 * Math.min(mult, prev) * 0.95) };
}

/** A new player with 1.5m who buys one Peugeot 504 at its showroom price, leaving 100k. */
async function buyCar(uid) {
  await balance(uid);
  await sql('UPDATE wallets SET balance = 1500000 WHERE uid = ?', [uid]);
  await events(uid, [{ id: 'buy1', kind: 'buy', ref: 'peugeot_504', amount: -1_400_000 }]);
}

const results = [];
function report(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

/** Put the player in a bank branch: a username, a room socket, and one move. */
async function enterBank(uid) {
  await api(uid, 'GET', '/api/wallet');
  await sql('INSERT INTO players (uid, created_at, last_seen) VALUES (?1, ?2, ?2) ON CONFLICT(uid) DO NOTHING', [uid, Date.now()]);
  await sql('UPDATE players SET username = ?2 WHERE uid = ?1', [uid, ('u' + uid.replace(/[^a-z0-9]/g, '')).slice(-14)]);
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/api/room/kaduna?uid=${uid}`);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('socket failed')); });
  ws.send(JSON.stringify({ t: 'move', area: 'place:kaduna:bank', x: 1, y: 0, z: 1, yaw: 0, pose: 'stand' }));
  await new Promise((r) => setTimeout(r, 300));
  return ws;
}

const tests = {
  async bankDeposit() {
    const uid = newUid('dep');
    const ws = await enterBank(uid);
    const rs = await parallel(N, () => api(uid, 'POST', '/api/bank', { action: 'deposit', amount: 10_000, requestId: rid() }));
    const ok = count(rs, (r) => r.status === 200);
    const [acc] = await sql('SELECT w.balance, b.savings FROM wallets w JOIN bank_accounts b ON b.uid = w.uid WHERE w.uid = ?', [uid]);
    report('bank: parallel deposits, distinct ids', acc.balance + acc.savings === 150_000 && acc.balance >= 0 && acc.savings === ok * 10_000,
      `${N}x deposit 10k from 150k: ${ok} ok, wallet ${acc.balance}, savings ${acc.savings}, statuses ${[...new Set(rs.map((r) => r.status))]}`);

    const same = rid();
    const before = acc.savings;
    const rs2 = await parallel(N, () => api(uid, 'POST', '/api/bank', { action: 'withdraw', amount: 10_000, requestId: same }));
    const [acc2] = await sql('SELECT w.balance, b.savings FROM wallets w JOIN bank_accounts b ON b.uid = w.uid WHERE w.uid = ?', [uid]);
    report('bank: one withdraw id sent many times', before - acc2.savings === 10_000 && acc2.balance + acc2.savings === 150_000,
      `${N}x same id: savings ${before} -> ${acc2.savings}, wallet ${acc2.balance}, ${count(rs2, (r) => r.status === 200)} ok`);

    const rs3 = await parallel(N, () => api(uid, 'POST', '/api/bank', { action: 'withdraw', amount: 30_000, requestId: rid() }));
    const [acc3] = await sql('SELECT w.balance, b.savings FROM wallets w JOIN bank_accounts b ON b.uid = w.uid WHERE w.uid = ?', [uid]);
    report('bank: parallel withdrawals past savings', acc3.savings >= 0 && acc3.balance + acc3.savings === 150_000,
      `${N}x withdraw 30k: ${count(rs3, (r) => r.status === 200)} ok, wallet ${acc3.balance}, savings ${acc3.savings}`);
    ws.close();
  },

  async repayDebt() {
    const uid = newUid('debt');
    await api(uid, 'GET', '/api/bank');
    await sql('UPDATE bank_accounts SET debt = 50000 WHERE uid = ?', [uid]);
    const rs = await parallel(N, () => api(uid, 'POST', '/api/bank', { action: 'repay_debt', amount: 10_000, requestId: rid() }));
    const [acc] = await sql('SELECT w.balance, b.debt FROM wallets w JOIN bank_accounts b ON b.uid = w.uid WHERE w.uid = ?', [uid]);
    report('bank: parallel debt repayments past the debt', acc.debt === 0 && acc.balance === 100_000,
      `${N}x repay 10k on 50k debt: ${count(rs, (r) => r.status === 200)} ok, debt ${acc.debt}, wallet ${acc.balance}`);
  },

  async pay() {
    const a = newUid('payA');
    const b = newUid('payB');
    for (const u of [a, b]) {
      await api(u, 'GET', '/api/wallet');
      await sql('INSERT INTO players (uid, created_at, last_seen) VALUES (?1, ?2, ?2) ON CONFLICT(uid) DO NOTHING', [u, Date.now()]);
      await sql('UPDATE players SET username = ?2 WHERE uid = ?1', [u, ('u' + u.replace(/[^a-z0-9]/g, '')).slice(-14)]);
    }
    const rs = await parallel(N, () => api(a, 'POST', '/api/pay', { to: b, amount: 20_000 }));
    const ok = count(rs, (r) => r.status === 200);
    const [ba, bb] = [await balance(a), await balance(b)];
    report('pay: parallel transfers past the balance', ba >= 0 && ba + bb === 300_000 && bb === 150_000 + ok * 20_000,
      `${N}x pay 20k from 150k: ${ok} ok, sender ${ba}, recipient ${bb}, sum ${ba + bb}, statuses ${[...new Set(rs.map((r) => r.status))]}`);

    // A <-> B both ways at once: nothing created or lost.
    const rs2 = await parallel(N, (i) => (i % 2 ? api(a, 'POST', '/api/pay', { to: b, amount: 5_000 }) : api(b, 'POST', '/api/pay', { to: a, amount: 5_000 })));
    const [ba2, bb2] = [await balance(a), await balance(b)];
    report('pay: crossing transfers conserve money', ba2 + bb2 === 300_000 && ba2 >= 0 && bb2 >= 0,
      `${N} crossing 5k pays: ${count(rs2, (r) => r.status === 200)} ok, ${ba2} + ${bb2} = ${ba2 + bb2}`);
  },

  async sameEventId() {
    const uid = newUid('idem');
    await buyCar(uid);
    const rs = await parallel(N, () => events(uid, [{ id: 'sell1', kind: 'sell', ref: 'peugeot_504', amount: 50_000 }]));
    const bal = await balance(uid);
    report('wallet: one sell event id sent many times', bal === 150_000, `${N}x same event: balance ${bal} (want 150000), statuses ${[...new Set(rs.map((r) => r.status))]}`);
  },

  async doubleSell() {
    const uid = newUid('sell');
    await buyCar(uid);
    const rs = await parallel(N, (i) => events(uid, [{ id: `sell${i}`, kind: 'sell', ref: 'peugeot_504', amount: 50_000 }]));
    const sold = count(rs, (r) => (r.data.accepted?.length ?? 0) > 0);
    const bal = await balance(uid);
    report('wallet: one car sold in parallel', bal === 150_000, `bought 1 car, ${N} parallel sells at 50k: ${sold} accepted, balance ${bal} (want 150000)`);
  },

  async doubleLiquidate() {
    const uid = newUid('inv');
    await balance(uid);
    const p = await gingerPrices();
    await events(uid, [{ id: 'b1', kind: 'invest', ref: 'ginger_farm', amount: -p.buy }]);
    const [h] = await sql("SELECT units FROM holdings WHERE uid = ? AND inv_id = 'ginger_farm'", [uid]);
    const rs = await parallel(N, (i) => events(uid, [{ id: `liq${i}`, kind: 'invest', ref: 'ginger_farm', amount: p.sell }]));
    const sold = count(rs, (r) => (r.data.accepted?.length ?? 0) > 0);
    const bal = await balance(uid);
    const want = 150_000 - p.buy + p.sell;
    const [left] = await sql("SELECT units FROM holdings WHERE uid = ? AND inv_id = 'ginger_farm'", [uid]);
    report('market: one unit liquidated in parallel', bal === want, `bought ${h?.units} unit at ${p.buy}, ${N} parallel liquidations at ${p.sell}: ${sold} accepted, balance ${bal} (want ${want}), units left ${left?.units}`);
  },

  async propertySell() {
    const uid = newUid('prop');
    await balance(uid);
    await events(uid, [{ id: 'land', kind: 'spend', ref: 'p:x1:land', amount: -100_000 }]);
    const rs = await parallel(N, (i) => events(uid, [{ id: `ps${i}`, kind: 'property', ref: 'p:x1:sell', amount: 95_000 }]));
    const sold = count(rs, (r) => (r.data.accepted?.length ?? 0) > 0);
    const bal = await balance(uid);
    report('wallet: one property sold in parallel', bal === 145_000, `paid 100k into a plot, ${N} parallel sales at 95k: ${sold} accepted, balance ${bal} (want 145000)`);
  },

  async gigCap() {
    const uid = newUid('gig');
    await balance(uid);
    const rs = await parallel(N, (i) => events(uid, Array.from({ length: 5 }, (_, j) => ({ id: `g${i}_${j}`, kind: 'gig', ref: 'luck', amount: 12_000 }))));
    const [g] = await sql("SELECT COALESCE(SUM(amount), 0) AS total FROM ledger WHERE uid = ? AND kind = 'gig' AND applied = 1", [uid]);
    report('wallet: hourly gig cap under parallel requests', g.total <= 60_000, `${N} requests x 5 "luck" gigs of 12k (cap 60k an hour): ${g.total} paid, statuses ${[...new Set(rs.map((r) => r.status))]}`);
  },

  async reset() {
    const uid = newUid('reset');
    await balance(uid);
    await events(uid, [{ id: 's1', kind: 'spend', ref: 'food', amount: -150_000 }]);
    const before = await balance(uid);
    const rs = await parallel(N, () => api(uid, 'POST', '/api/wallet/reset'));
    const bal = await balance(uid);
    report('wallet: parallel new-life resets', bal === 150_000, `balance ${before}, ${N} parallel resets: balance ${bal} (want 150000), statuses ${[...new Set(rs.map((r) => r.status))]}`);
  },

  async origin() {
    const uid = newUid('origin');
    await balance(uid);
    const rs = await parallel(N, () => api(uid, 'POST', '/api/origin', { answers: {} }));
    const [w] = await sql('SELECT w.balance, w.origin, b.debt FROM wallets w JOIN bank_accounts b ON b.uid = w.uid WHERE w.uid = ?', [uid]);
    const [l] = await sql("SELECT COUNT(*) AS n, SUM(amount) AS total FROM ledger WHERE uid = ? AND kind = 'start'", [uid]);
    report('wallet: parallel origin draws', l.n === 1 && w.balance === 150_000 + l.total,
      `${N} parallel draws: origin ${w.origin}, balance ${w.balance}, debt ${w.debt}, start rows ${l.n}, origins answered ${[...new Set(rs.map((r) => r.data.origin))]}`);
  },

  /** A buy racing a payment that empties the wallet: the car must not come free. */
  async buyRacingPay() {
    const a = newUid('bpA');
    const b = newUid('bpB');
    for (const u of [a, b]) {
      await api(u, 'GET', '/api/wallet');
      await sql('INSERT INTO players (uid, created_at, last_seen) VALUES (?1, ?2, ?2) ON CONFLICT(uid) DO NOTHING', [u, Date.now()]);
      await sql('UPDATE players SET username = ?2 WHERE uid = ?1', [u, ('u' + u.replace(/[^a-z0-9]/g, '')).slice(-14)]);
    }
    await sql('UPDATE wallets SET balance = 1400000 WHERE uid = ?', [a]);
    await warm(4);
    await Promise.all([
      api(a, 'POST', '/api/pay', { to: b, amount: 1_400_000 }),
      events(a, [{ id: 'car', kind: 'buy', ref: 'peugeot_504', amount: -1_400_000 }]),
    ]);
    // Whatever happened, cash in: sell the car if the server thinks there is one.
    for (let i = 0; i < 3; i++) if ((await events(a, [{ id: 'cash', kind: 'sell', ref: 'peugeot_504', amount: 1_050_000 }])).status === 200) break;
    const [ba, bb] = [await balance(a), await balance(b)];
    report('wallet: buying a car while paying the same money away', ba + bb <= 1_550_000, `1.4m in hand (+150k the other player started with): ended with ${ba} + ${bb} = ${ba + bb} (at most 1550000)`);
  },

  /** Not a race: what one player can do alone with no money. */
  async buyWithoutMoney() {
    const uid = newUid('broke');
    await balance(uid);
    await events(uid, [{ id: 's1', kind: 'spend', ref: 'food', amount: -150_000 }]);
    const start = await balance(uid);
    const r1 = await events(uid, [
      { id: 'b1', kind: 'buy', ref: 'peugeot_504', amount: -1 },
      { id: 's2', kind: 'sell', ref: 'peugeot_504', amount: 1_050_000 },
    ]);
    const afterCar = await balance(uid);
    const p = await gingerPrices();
    const r2 = await events(uid, [
      { id: 'i0', kind: 'spend', ref: 'food', amount: -afterCar },
      { id: 'i1', kind: 'invest', ref: 'ginger_farm', amount: -p.buy },
      { id: 'i2', kind: 'invest', ref: 'ginger_farm', amount: p.sell },
    ]);
    const afterInv = await balance(uid);
    report('wallet: buying with an empty wallet, then selling', afterCar === start && afterInv === 0,
      `wallet ${start}: buy car for 1 + sell -> ${afterCar} (rejected ${JSON.stringify(r1.data.rejected)}); emptied, buy 1 unit + liquidate -> ${afterInv} (rejected ${JSON.stringify(r2.data.rejected)})`);
  },

  async marketTick() {
    // The tick after the newest one in the table, so this run always has a step to take.
    await fetch(`${BASE}/__tick`);
    const [{ last }] = await sql("SELECT MAX(t) AS last FROM market_now WHERE inv_id NOT LIKE 'usd:%'");
    const now = last + 300_000;
    const before = await sql("SELECT inv_id, mult, prev, t FROM market_now WHERE inv_id NOT LIKE 'usd:%'");
    const rs = await parallel(6, () => fetch(`${BASE}/__tick?now=${now}`).then((r) => r.status));
    const after = await sql("SELECT inv_id, mult, prev, t FROM market_now WHERE inv_id NOT LIKE 'usd:%'");
    const dup = await sql('SELECT COUNT(*) AS n FROM (SELECT inv_id, t FROM market_ticks GROUP BY inv_id, t HAVING COUNT(*) > 1)');
    const was = new Map(before.map((r) => [r.inv_id, r]));
    // One step only: the new `prev` must be the old `mult`, and the newest tick row must be the price in market_now.
    const stepped = after.filter((r) => r.t === now && was.get(r.inv_id)?.t !== now);
    const twice = stepped.filter((r) => was.get(r.inv_id) && r.prev !== was.get(r.inv_id).mult);
    const ticks = await sql('SELECT inv_id, mult FROM market_ticks WHERE t = ?', [now]);
    const tickOf = new Map(ticks.map((r) => [r.inv_id, r.mult]));
    const split = stepped.filter((r) => tickOf.get(r.inv_id) !== r.mult);
    report('market: cron tick run 6 times at once', twice.length === 0 && dup[0].n === 0 && split.length === 0,
      `${stepped.length}/${after.length} ventures stepped, stepped twice: ${twice.length}, chart row != live price: ${split.length}, duplicate tick rows: ${dup[0].n}, statuses ${[...new Set(rs)]}`);
  },
};

await fetch(`${BASE}/__delay?ms=${process.env.DELAY ?? 15}`);
const only = process.argv.slice(2);
for (const [name, fn] of Object.entries(tests)) {
  if (only.length && !only.includes(name)) continue;
  try {
    await fn();
  } catch (e) {
    report(name, false, `threw: ${e.stack ?? e}`);
  }
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(0);
