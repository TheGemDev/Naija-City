// The phone's app store, plus the silly apps you can only get from it.

import { useEffect, useRef, useState } from 'react';
import { naira, useGame } from '../game/store';
import { STORE_APPS, useApps, type StoreApp } from '../game/apps';
import { PHONE_SEARCH } from '../game/phoneSearch';
import { Emoji } from './Icons';
import { BABA_PERKS, PERK_BY_ID } from '../game/scams';
import { buyPerk, loadScams, useLive } from '../net/live';

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/* ---------- Store ---------- */

export function AppStore({ ios, onOpen }: { ios: boolean; onOpen: (id: string) => void }) {
  const installed = useApps((s) => s.installed);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const list = tab === 'mine' ? STORE_APPS.filter((a) => installed.includes(a.id)) : STORE_APPS;
  return (
    <>
      <div className="hero hero-dark store-hero">
        <small>{ios ? 'App Store' : 'Play Store'} · Naija edition</small>
        <b>Get apps 📲</b>
        <small>Some are useful. Some will land you in prison.</small>
      </div>
      <div className="store-tabs">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>Top charts</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Installed ({STORE_APPS.filter((a) => installed.includes(a.id)).length})</button>
      </div>
      {list.length === 0 && <p className="muted">Nothing installed yet. Go and download something.</p>}
      {list.map((a, i) => (
        <StoreRow key={a.id} app={a} rank={tab === 'all' ? i + 1 : undefined} onOpen={onOpen} />
      ))}
    </>
  );
}

function StoreRow({ app, rank, onOpen }: { app: StoreApp; rank?: number; onOpen: (id: string) => void }) {
  const has = useApps((s) => s.installed.includes(app.id));
  const install = useApps((s) => s.install);
  const uninstall = useApps((s) => s.uninstall);
  const [progress, setProgress] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const download = () => {
    setProgress(0);
    // Kaduna 4G: fast-ish, with the odd stall.
    timer.current = setInterval(() => {
      setProgress((p) => {
        const next = (p ?? 0) + (Math.random() < 0.15 ? 0 : 900 / app.mb / 10 + Math.random() * 8);
        if (next < 100) return next;
        clearInterval(timer.current);
        install(app.id);
        useGame.getState().toast(`${app.label} installed. Check your home screen ${app.icon}`);
        return null;
      });
    }, 120);
  };
  return (
    <div className="tile store-row">
      {rank && <span className="store-rank">{rank}</span>}
      <span className="tile-icon store-icon" style={{ background: `linear-gradient(160deg, ${app.bg[0]}, ${app.bg[1]})` }}>
        <Emoji char={app.icon} size={24} />
      </span>
      <span className="tile-info">
        <b>
          {app.label} {app.shady && <em className="store-shady">18+</em>}
        </b>
        <small>{app.blurb}</small>
        <small>
          ★ {app.rating.toFixed(1)} · {app.mb} MB
        </small>
        {app.shady && PHONE_SEARCH.evidence[app.id] && <small className="store-warn">🚔 If you get arrested, police check your phone. This app makes your case worse.</small>}
        {progress !== null && (
          <span className="store-bar">
            <i style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
      {has ? (
        <span className="store-actions">
          <button className="btn sm danger" aria-label={`Delete ${app.label}`} onClick={() => uninstall(app.id)}>Delete</button>
          <button className="btn sm" onClick={() => onOpen(app.id)}>Open</button>
        </span>
      ) : (
        <button className="btn sm" disabled={progress !== null} onClick={download}>
          {progress === null ? 'Get' : `${Math.floor(progress)}%`}
        </button>
      )}
    </div>
  );
}

/* ---------- Baba Online ---------- */

const READINGS = [
  { text: 'The ancestors say: that girl wey no dey reply you, she don block you. Move on.', mood: '😔' },
  { text: 'Money is coming from the North. Or the South. The spirits network no too clear.', mood: '🤑' },
  { text: 'Avoid any okada with a green helmet this week. Don’t ask why.', mood: '😨' },
  { text: 'Your village people are on leave. This is your window. Hustle hard!', mood: '💪' },
  { text: 'A man in agbada will bless you. Or collect your money. Both are possible.', mood: '🤷🏾' },
  { text: 'NEPA will bring light tonight. (Baba is 12% sure.)', mood: '💡' },
  { text: 'You will marry a rich person. First, buy a better phone so they take you serious.', mood: '💍' },
  { text: 'The calabash is cloudy. Send another transfer for HD reading.', mood: '🌫️' },
  { text: 'Someone in your contacts owes you ₦5k and has forgotten. They have not forgotten.', mood: '🧐' },
  { text: 'Danger! Do not eat suya from a stranger after 11pm. Or do. Baba no be your papa.', mood: '🍢' },
];
const CHARMS = [
  { id: 'reading', label: 'Quick reading', price: 500, icon: '🔮' },
  { id: 'hd', label: 'HD reading (premium spirits)', price: 2_000, icon: '✨' },
  { id: 'charm', label: '“Anti-village-people” charm', price: 5_000, icon: '🧿' },
];

export function BabaApp() {
  const myPerks = useLive((s) => s.perks);
  const busyBaba = useLive((s) => s.busy);
  useEffect(() => void loadScams(), []);
  const buy = async (id: string) => {
    const r = await buyPerk(id);
    if (!r) return;
    setReading(r.fake
      ? { text: 'Hmm. The soap is… ordinary Omo. Baba’s supplier has absconded. No refund, spirits are non-refundable.', mood: '🤡' }
      : { text: `Done. ${PERK_BY_ID[id].label} is yours. Use it wisely, or foolishly. Baba no go know.`, mood: PERK_BY_ID[id].icon });
  };
  const payFor = useGame((s) => s.payFor);
  const [reading, setReading] = useState<{ text: string; mood: string } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [charms, setCharms] = useState(0);
  const consult = (id: string, price: number) => {
    if (!payFor(price, `Baba Online: ${id}`)) return;
    if (id === 'charm') {
      setCharms((c) => c + 1);
      setReading({ text: 'Charm activated. Your village people have received a 404 error.', mood: '🧿' });
      return;
    }
    setShaking(true);
    setReading(null);
    setTimeout(() => {
      setShaking(false);
      setReading(pick(READINGS));
    }, 1_200);
  };
  return (
    <>
      <div className="hero hero-purple">
        <small>Licensed by the Council of Ancestors (pending)</small>
        <b>🔮 Baba Online</b>
        <small>Spiritual consultation, now with bank transfer.</small>
      </div>
      <div className={`baba-bowl ${shaking ? 'shake' : ''}`}>
        <span>{shaking ? '🌀' : reading?.mood ?? '🥣'}</span>
        <p>{shaking ? 'Baba is consulting… *rattles cowries*' : reading?.text ?? 'Pay, and the calabash will speak.'}</p>
      </div>
      {CHARMS.map((c) => (
        <button key={c.id} className="tile tile-btn" disabled={shaking} onClick={() => consult(c.id, c.price)}>
          <span className="tile-icon">{c.icon}</span>
          <span className="tile-info"><b>{c.label}</b><small>{naira(c.price)}</small></span>
        </button>
      ))}
      <h4>Street-level spiritual products</h4>
      {BABA_PERKS.map((p) => (
        <button key={p.id} className="tile tile-btn" disabled={busyBaba || shaking} onClick={() => void buy(p.id)}>
          <span className="tile-icon">{p.icon}</span>
          <span className="tile-info"><b>{p.label} · {naira(p.price)}</b><small>{p.blurb} {myPerks.find((m) => m.perk === p.id) ? `(You have ${myPerks.find((m) => m.perk === p.id)!.charges} left)` : ''}</small></span>
        </button>
      ))}
      {charms > 0 && <p className="muted">You are wearing {charms} charm{charms > 1 ? 's' : ''}. Nothing has changed. Or has it? 👀</p>}
    </>
  );
}

/* ---------- Pidgin AI ---------- */

const PIDGIN: [RegExp, string][] = [
  [/\bhow are you\b/gi, 'how far'],
  [/\bwhat is happening\b/gi, 'wetin dey happen'],
  [/\bwhat\b/gi, 'wetin'],
  [/\bi am\b/gi, 'I dey'],
  [/\bi'm\b/gi, 'I dey'],
  [/\byou are\b/gi, 'you dey'],
  [/\bthey are\b/gi, 'dem dey'],
  [/\bi don't know\b/gi, 'I no sabi'],
  [/\bknow\b/gi, 'sabi'],
  [/\bdon't\b/gi, 'no'],
  [/\bdo not\b/gi, 'no'],
  [/\bisn't it\b/gi, 'abi'],
  [/\bfriend\b/gi, 'padi'],
  [/\bfriends\b/gi, 'padis'],
  [/\bmoney\b/gi, 'ego'],
  [/\bfood\b/gi, 'chop'],
  [/\beat\b/gi, 'chop'],
  [/\bchildren\b/gi, 'pikin dem'],
  [/\bchild\b/gi, 'pikin'],
  [/\bwant\b/gi, 'wan'],
  [/\bgoing\b/gi, 'dey go'],
  [/\bcome\b/gi, 'come'],
  [/\bthem\b/gi, 'dem'],
  [/\bthey\b/gi, 'dem'],
  [/\bthis\b/gi, 'dis'],
  [/\bthat\b/gi, 'dat'],
  [/\bvery\b/gi, 'well well'],
  [/\bproblem\b/gi, 'wahala'],
  [/\btrouble\b/gi, 'wahala'],
  [/\bwhy\b/gi, 'why na'],
  [/\bplease\b/gi, 'abeg'],
  [/\bstop\b/gi, 'stop am'],
  [/\bbroke\b/gi, 'dey suffer sapa'],
  [/\bpoor\b/gi, 'sapa dey hold'],
  [/\brich\b/gi, 'get levels'],
  [/\bgirlfriend\b/gi, 'babe'],
  [/\bhello\b/gi, 'how body'],
  [/\bthank you\b/gi, 'tanks well well'],
  [/\bnothing\b/gi, 'notin'],
  [/\bthing\b/gi, 'tin'],
  [/\bis\b/gi, 'na'],
];
const ENDINGS = [' o!', ' sha.', ' abeg.', ', you hear?', ' 😂', ' — no be lie.', ''];

function toPidgin(text: string) {
  if (!text.trim()) return '';
  let out = text;
  for (const [re, rep] of PIDGIN) out = out.replace(re, rep);
  return out.replace(/[.!?]*\s*$/, '') + pick(ENDINGS);
}

export function PidginApp() {
  const [text, setText] = useState('');
  const [out, setOut] = useState('');
  return (
    <>
      <div className="hero hero-green">
        <small>Powered by 100% Naija Intelligence (NI)</small>
        <b>🗣️ Pidgin AI</b>
        <small>Grammar in, vibes out.</small>
      </div>
      <textarea className="text-input pidgin-in" rows={3} value={text} placeholder="Type English… e.g. “Please my friend, I don't have money for food”" onChange={(e) => setText(e.target.value)} />
      <button className="btn wide" disabled={!text.trim()} onClick={() => setOut(toPidgin(text))}>
        Translate am 🔁
      </button>
      {out && (
        <div className="baba-bowl pidgin-out">
          <span>🇳🇬</span>
          <p>{out}</p>
        </div>
      )}
      <p className="muted">Try: “What is happening, I am very broke”</p>
    </>
  );
}
