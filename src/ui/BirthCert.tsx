import { useMemo, useState } from 'react';
import { birthCertSvg, CERT_H, CERT_W, destinyLine, randomBirthdate } from '../game/birthCert';
import { ORIGINS, type OriginId } from '../game/origins';
import { PHONE_BY_ID } from '../game/phones';
import { naira } from '../game/store';
import { regionOf } from '../game/regions';
import { inviteLink, shareLink, userLink } from '../net/deeplink';
import { useSession } from '../net/session';
import { saveImage } from './saveImage';
import './birthcert.css';

const CAN_SHARE_FILES = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'cert.png', { type: 'image/png' })] });
/** The saved picture is drawn larger than the SVG's own size, so it stays sharp when zoomed or printed. */
const PNG_SCALE = 2;

/** The SVG as a PNG file. Null when the browser won't draw it (then sharing falls back to a link). */
async function certPng(svg: string): Promise<File | null> {
  try {
    const img = new Image();
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = CERT_W * PNG_SCALE;
    canvas.height = CERT_H * PNG_SCALE;
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
    return blob && new File([blob], 'naija-city-birth-certificate.png', { type: 'image/png' });
  } catch {
    return null;
  }
}

/** Last step of a new life: your birth certificate, which holds what you drew, to keep or show off, before you step into the city. */
export function BirthCert({ name, look, origin, state, onBack, onStart }: { name: string; look: string; origin: OriginId; state: string; onBack?: () => void; onStart: () => void }) {
  const user = useSession((s) => s.user);
  const [at] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const region = regionOf(state);
  // "The Crocodile City · Kaduna State": the state is the second half of the city's tagline.
  const stateName = region.tagline.split(' · ')[1] ?? region.name;
  const username = user?.username ?? null;
  // The date of birth they gave at sign-up. Nobody without one gets here today, but then a made-up one stands in.
  const dob = user?.birthdate ?? randomBirthdate(user?.uid ?? username ?? name, at);
  const destiny = destinyLine(origin, user?.uid ?? username ?? name);
  const status = ORIGINS[origin].label;
  const start = useMemo(() => {
    const o = ORIGINS[origin];
    return { money: naira(o.money), home: o.home, phone: PHONE_BY_ID[o.phone]?.name ?? 'None', catches: o.catches };
  }, [origin]);
  const svg = useMemo(
    () => birthCertSvg({ name, username, look, city: region.name, state: stateName, status, destiny, dob, at, uid: user?.uid, start }),
    [name, username, look, region.name, stateName, status, destiny, dob, at, user?.uid, start],
  );
  const src = useMemo(() => `data:image/svg+xml,${encodeURIComponent(svg)}`, [svg]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const share = () => run(async () => {
    const line = `I was just born in ${stateName}, status: ${status}. My destiny: “${destiny}”. Come and find me in Naija City.`;
    const file = await certPng(svg);
    // No file sharing here (most desktops): keep the picture instead, so the one button never does nothing.
    if (file && !CAN_SHARE_FILES) return void (await saveImage(file));
    if (!file) return void shareLink(username ? userLink(username) : 'https://naija.city', line);
    await navigator.share({ files: [file], title: 'My Naija City birth certificate', text: `${line}\nPlay here 👉 ${username ? inviteLink(username) : 'https://naija.city'}` }).catch(() => { /* closed the share sheet */ });
  });

  return (
    <>
      <div className="cert-head">
        <div className="fate-intro">
          <h3 className="fate-title">You were born…</h3>
          <p className="muted small">It’s official. Keep your certificate or show your people.</p>
        </div>
        <button type="button" className="cert-share" aria-label="Share certificate" title="Share or save" disabled={busy} onClick={() => void share()}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 15V3" />
            <path d="M7.5 7.5 12 3l4.5 4.5" />
            <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          </svg>
          Share
        </button>
      </div>
      <div className="cert-wrap">
        <img className="cert-paper" src={src} width={CERT_W} height={CERT_H} alt={`Naija City birth certificate of ${name}${username ? ` (@${username})` : ''}, born in ${stateName}. Status: ${status}. Destiny: ${destiny}`} draggable={false} />
      </div>
      <div className="row-btns wiz-foot">
        {onBack && (
          <button className="btn" onClick={onBack}>
            ← Back
          </button>
        )}
        <button className="btn big go" onClick={onStart}>
          Start my life →
        </button>
      </div>
    </>
  );
}
