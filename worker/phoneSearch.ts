// After every arrest the police or EFCC go through the player's phone (rules: src/game/phoneSearch.ts).
// Installed apps come from the cloud save; shady ones add a fine and jail time, and some are seized.
// They always pat you down first: a gun on you is seized with a huge fine (worker/guns.ts).

import { notifyPlayer } from './shards';
import { rand, transfer, usernames } from './crime';
import { handle, naira, postFeed } from './feed';
import { PHONE_SEARCH, type Agency, type PhoneSearchResult } from '../src/game/phoneSearch';
import { fineItem, recordExhibits } from './exhibits';
import { confiscateGun } from './guns';
import { GUNS } from '../src/game/guns';


/** Search the phone of someone who has just been jailed for baseMinutes. Tells them what was found. */
export async function searchPhone(env: Env, uid: string, agency: Agency, baseMinutes: number): Promise<PhoneSearchResult> {
  const db = env.DB;
  const now = Date.now();
  const result: PhoneSearchResult = { agency, searched: false, found: [], seized: [], fine: 0, extraMinutes: 0, until: null, lines: [], at: now, gun: null };
  // Guns are illegal. Whatever they arrested you for, a gun on you goes, and so does its fine.
  result.gun = await confiscateGun(db, uid, now);
  if (result.gun) {
    const name = GUNS[result.gun.gun].name;
    result.lines.push(`They patted you down and found your ${name}. Seized, and a ${naira(result.gun.fine)} fine.`);
    const who = (await usernames(db, [uid])).get(uid);
    await postFeed(db, uid, 'arrest', '🔫', `${agency === 'efcc' ? 'EFCC' : 'Police'} found a ${name.toLowerCase()} on ${handle(who)} at the arrest. Gun seized, ${naira(result.gun.fine)} fine. Illegal firearm, case closed. ⛓️`).catch(() => {});
  }
  const row = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(uid).first<{ data: string }>();
  let save: { apps?: unknown } | null = null;
  try {
    save = row ? JSON.parse(row.data) : null;
  } catch {
    save = null;
  }
  const apps = Array.isArray(save?.apps) ? (save.apps as unknown[]).filter((a): a is string => typeof a === 'string') : [];

  if (rand() < PHONE_SEARCH.chance[agency]) {
    result.searched = true;
    let fineDue = 0;
    let extraPct = 0;
    for (const id of apps) {
      const ev = PHONE_SEARCH.evidence[id]?.[agency];
      if (!ev) continue;
      result.found.push(id);
      fineDue += ev.fine;
      extraPct += ev.extraPct;
      if (ev.seize) result.seized.push(id);
      result.lines.push(ev.line);
    }
    if (!result.found.length) result.lines.push(PHONE_SEARCH.clean[agency]);
    if (fineDue) result.fine = await transfer(db, uid, null, fineDue, agency === 'efcc' ? 'efcc_fine' : 'fine', '', `phonesearch:${uid}:${now}`);
    result.extraMinutes = Math.round((baseMinutes * extraPct) / 100);
    const stmts = [];
    if (result.extraMinutes) {
      stmts.push(db.prepare('UPDATE players SET jailed_until = jailed_until + ? WHERE uid = ? AND jailed_until > ?').bind(result.extraMinutes * 60_000, uid, now));
    }
    if (result.seized.length && save && row) {
      // saved_at stays as it is, so the player's next upload isn't refused as coming from an old copy.
      save.apps = apps.filter((a) => !result.seized.includes(a));
      stmts.push(db.prepare('UPDATE saves SET data = ? WHERE uid = ?').bind(JSON.stringify(save), uid));
    }
    if (stmts.length) await db.batch(stmts);
    if (agency === 'efcc') {
      await recordExhibits(db, uid, `phone:${now}`, 'Phone searched by the EFCC', [
        fineItem(result.fine, 'Fine for what was on your phone'),
        ...result.seized.map((id) => ({ kind: 'app' as const, icon: '📱', label: (PHONE_SEARCH.labels[id] ?? id).replace(/^the /, ''), value: 0 })),
      ], now);
    }
    if (result.found.length) {
      const who = (await usernames(db, [uid])).get(uid);
      const list = result.found.map((id) => PHONE_SEARCH.labels[id] ?? id).join(', ');
      await postFeed(
        db, uid, 'arrest', '🔍',
        agency === 'efcc'
          ? `EFCC went through ${handle(who)}'s phone and found ${list}. ${naira(result.fine)} extra fine${result.extraMinutes ? ` and ${result.extraMinutes} more minutes inside` : ''}. Case don cast. 📱`
          : `Police searched ${handle(who)}'s phone and found ${list}.${result.found.includes('yahoo') ? ' Case don turn EFCC matter.' : ''} ${naira(result.fine)} extra fine. 📱`,
      );
    }
  }

  const jailed = await db.prepare('SELECT jailed_until FROM players WHERE uid = ?').bind(uid).first<{ jailed_until: number | null }>();
  result.until = jailed?.jailed_until ?? null;
  await notifyPlayer(env, uid, { t: 'fun', kind: 'phoneSearch', search: result });
  return result;
}
