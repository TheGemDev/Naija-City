import { useMemo, useState } from 'react';
import { mugshotSvg } from '../game/mugshot';
import { inviteLink, tweetLink } from '../net/deeplink';
import { useSession } from '../net/session';
import { usePlayerLook } from './Face';
import { Emoji } from './Icons';
import { saveImage } from './saveImage';
import './snap.css';

interface Props { uid: string | null; username: string | null; seed: number; at: number }

/** The police picture on a "caught stealing" tweet: the thief in orange against the height chart. */
export function Mugshot({ uid, username, seed, at }: Props) {
  const look = usePlayerLook(uid, username);
  const src = useMemo(
    () => `data:image/svg+xml,${encodeURIComponent(mugshotSvg({ look, uid, username, seed, at }))}`,
    [look, uid, username, seed, at],
  );
  return <img className="mugshot" src={src} alt={`Police photo of @${username ?? 'the suspect'}`} draggable={false} />;
}

const CAN_SHARE_FILES = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'mugshot.png', { type: 'image/png' })] });
/** The saved picture: the mugshot at twice its drawn size, over a strip that says where it is from. */
const SIDE = 800;
const STRIP = 96;

/** The mugshot as a PNG to keep or send, with the game's address under it. Null when the browser won't draw it. */
async function mugshotPng(svg: string, username: string | null): Promise<File | null> {
  try {
    const img = new Image();
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = SIDE;
    canvas.height = SIDE + STRIP;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, SIDE, SIDE);
    ctx.fillStyle = '#0a4d2a';
    ctx.fillRect(0, SIDE, SIDE, STRIP);
    ctx.textBaseline = 'middle';
    ctx.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
    const site = 'https://naija.city';
    // The address keeps its full width; the line beside it is squeezed into what is left.
    const room = SIDE - 28 * 2 - ctx.measureText(site).width - 24;
    ctx.fillStyle = '#fff';
    ctx.fillText(`@${username ?? 'someone'} was caught in Naija City`, 28, SIDE + STRIP / 2, room);
    ctx.fillStyle = '#facc15';
    ctx.textAlign = 'right';
    ctx.fillText(site, SIDE - 28, SIDE + STRIP / 2);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
    return blob && new File([blob], `naija-city-mugshot-${username ?? 'suspect'}.png`, { type: 'image/png' });
  } catch {
    return null;
  }
}

/** Under a police tweet: send the mugshot out as a picture (the share sheet where there is one, a download elsewhere). */
export function MugshotShare({ uid, username, seed, at }: Props) {
  const look = usePlayerLook(uid, username);
  const me = useSession((s) => s.user?.username ?? null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const file = await mugshotPng(mugshotSvg({ look, uid, username, seed, at }), username);
      if (!file) return;
      if (!CAN_SHARE_FILES) return void (await saveImage(file));
      const line = me && me === username ? 'Police don post my mugshot for Naija City 😭' : `Police don catch @${username ?? 'somebody'} for Naija City 😂`;
      // The tweet itself, then the way in: an invite link counts whoever joins from it (net/referral.ts).
      await navigator.share({ files: [file], title: 'Naija City mugshot', text: `${line}\n${tweetLink(seed)}\nPlay here 👉 ${me ? inviteLink(me) : 'https://naija.city'}` }).catch(() => { /* closed the share sheet */ });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="gist-like" disabled={busy} onClick={() => void send()}>
      <Emoji char="🖼️" size={13} /> {CAN_SHARE_FILES ? 'Send picture' : 'Save picture'}
    </button>
  );
}
