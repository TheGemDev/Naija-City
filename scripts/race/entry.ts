// Harness for race.mjs: the real signed-in API (handleApi) with the uid taken from an x-uid header instead of a Firebase
// token, plus raw SQL (/__sql) and a market tick (/__tick). Local only; see race.mjs for how to run it.
import { handleApi } from '../../worker/index';
import { tickMarket } from '../../worker/market';
export { Room } from '../../worker/room';
export { Lobby } from '../../worker/lobby';

export default {
  async fetch(req: Request, real: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    // No queue here: pushes go nowhere.
    const jobs = { send: async () => {}, sendBatch: async () => {} };
    // Local D1 answers in well under a millisecond, so a request finishes before the next one starts. Real D1 is a
    // network hop away: every batch waits this long first (/__delay?ms=), which is what lets requests overlap.
    const g0 = globalThis as any;
    if (url.pathname === '/__delay') { g0.__delay = Number(url.searchParams.get('ms')) || 0; return Response.json({ ms: g0.__delay }); }
    const db = new Proxy(real.DB, {
      get: (t, k) => {
        if (k === 'batch') return async (stmts: any[]) => { if (g0.__delay) await new Promise((r) => setTimeout(r, g0.__delay)); return t.batch(stmts); };
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const env = new Proxy(real, { get: (t, k) => (k === 'JOBS' ? jobs : k === 'DB' ? db : t[k]) });
    if (url.pathname === '/__probe') {
      // Do two requests overlap? Each reads a counter, waits on D1, then writes it back.
      const g = globalThis as any;
      const seen = (g.__n = g.__n ?? 0);
      await env.DB.prepare('SELECT 1').first();
      g.__n = seen + 1;
      return Response.json({ n: g.__n });
    }
    try {
      if (url.pathname === '/__sql') {
        const { sql, args = [] } = (await req.json()) as { sql: string; args?: unknown[] };
        return Response.json((await env.DB.prepare(sql).bind(...args).all()).results);
      }
      if (url.pathname === '/__tick') {
        await tickMarket(env.DB, Number(url.searchParams.get('now')) || Date.now());
        return Response.json({ ok: true });
      }
      const uid = req.headers.get('x-uid') ?? url.searchParams.get('uid');
      if (!uid) return new Response('no uid', { status: 401 });
      return await handleApi(req, env, ctx, { uid });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'THROWN: ' + (e?.stack ?? e) }), { status: 500 });
    }
  },
};
