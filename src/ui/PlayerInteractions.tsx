import { useEffect, useState, type FormEvent } from 'react';
import { ALIAS_MAX, naira, useGame } from '../game/store';
import { cityNameHere } from '../game/regions';
import { useNet } from '../net/multiplayer';
import { arrestPlayer, payBail, steal, usePolice } from '../net/crime';
import { loadGuns, robAtGunpoint, shootPlayer, useGuns } from '../net/guns';
import { GUNS } from '../game/guns';
import { bailFor, POLICE } from '../game/crime';
import { requestMoney, sendMoney, sendHomeInvite, useSocial, type PlayerRef } from '../net/social';
import { shareLink, userLink } from '../net/deeplink';
import { PersonPreview } from './Closet';
import { useSession } from '../net/session';
import { DRIP_REVIEWS } from './PlaceHub';
import { Face } from './Face';

export function PlayerInteractions() {
  const player = useSocial((s) => s.interactionWith);
  const setPanel = useGame((s) => s.setPanel);
  const connected = useNet((s) => s.connected);
  const busyStealing = usePolice((s) => s.busy);
  // A loaded gun on me puts robbing and shooting on the menu (game/guns.ts).
  const gun = useGuns((s) => s.state?.gun ?? null);
  const busyGun = useGuns((s) => s.busy);
  const me = useSession((s) => s.user);
  const myUsername = me?.username ?? useGame((s) => s.name) ?? 'Odogwu';
  const money = useGame((s) => s.money);
  const charge = useGame((s) => s.charge);
  const toast = useGame((s) => s.toast);
  const say = useNet((s) => s.say);

  const officer = useGame((s) => s.jobId === POLICE.job);
  const wanted = usePolice((s) => (player ? s.wanted.find((w) => w.uid === player.uid) : undefined));
  const jailed = usePolice((s) => (player ? s.custody.find((p) => p.uid === player.uid) : undefined));

  const alias = useGame((s) => (player ? s.aliases[player.uid] : undefined));

  const [category, setCategory] = useState<'wild' | 'standard' | 'profile'>('wild');
  const [action, setAction] = useState<'actions' | 'send' | 'request' | 'spray'>('actions');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (player) void loadGuns();
  }, [player?.uid]);

  useEffect(() => {
    setCategory(player?.tab === 'profile' ? 'profile' : 'wild');
    setAction('actions');
    setAmount('');
    setNote('');
    setError(null);
  }, [player?.uid, player?.tab]);

  if (!player) return null;
  const username = player.username ?? 'player';
  const value = Math.floor(Number(amount.replace(/[^\d]/g, '')) || 0);

  const close = () => useSocial.setState({ interactionWith: null });
  const startChat = () => {
    useSocial.setState({ interactionWith: null, openWith: player.uid });
    setPanel('phone');
  };

  const submitMoney = async (event: FormEvent) => {
    event.preventDefault();
    if (value < 1 || (action === 'send' && value > money) || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'send') await sendMoney(player.uid, value, note.trim());
      else await requestMoney(player.uid, value, note.trim());
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete transfer');
      setBusy(false);
    }
  };

  const inviteHome = async (target: string) => {
    setBusy(true);
    setError(null);
    try {
      await sendHomeInvite(target);
      close();
      toast(`🏠 Invite sent to @${username}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send invite');
      setBusy(false);
    }
  };

  // Wild Player Actions
  const handleSprayAmount = async (sprayAmount: number) => {
    if (money < sprayAmount) return toast(`You need at least ${naira(sprayAmount)} to spray!`);
    setBusy(true);
    try {
      await sendMoney(player.uid, sprayAmount, '💸 Odogwu spray!');
      say(`💸 ODOGWU SPRAY! @${myUsername} sprayed ${naira(sprayAmount)} on @${username}! "Dorime! Chairman don land! E choke!" 🍾✨`);
      toast(`💸 You sprayed ${naira(sprayAmount)} on @${username}! Dorime!`);
      close();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not spray money');
      setBusy(false);
    }
  };

  const handleCashSlap = async () => {
    const cost = 5_000;
    if (money < cost) return toast(`You need ${naira(cost)} to slap with a cash bundle!`);
    setBusy(true);
    try {
      await sendMoney(player.uid, cost, '👋🏾 Odogwu cash slap!');
      say(`👋🏾 KPAAI! @${myUsername} slapped @${username} across the cheek with a crisp ${naira(cost)} cash bundle! "Do you know who I am?!" 💥😂`);
      toast(`👋🏾 You slapped @${username} with a ${naira(cost)} cash bundle!`);
      close();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not slap with cash');
      setBusy(false);
    }
  };

  const handleDanceBattle = () => {
    say(`🕺🏾 DANCE BATTLE! @${myUsername} challenged @${username} to an Afrobeats dance showdown! Poco Lee legwork vs Amapiano shuffle! Let's go! 🔥💃🏾`);
    toast(`🕺🏾 You challenged @${username} to a dance battle!`);
    close();
  };

  const handleSendDrink = () => {
    const cost = 5_000;
    if (money < cost) return toast(`You need ${naira(cost)} to send a VIP drink!`);
    charge(cost, `VIP Drink for @${username}`);
    say(`🍾 VIP SERVICE! @${myUsername} sent a chilled bottle of Ace of Spades & Hennessy to @${username}'s table! "Chairman salute!" 🥂👑`);
    toast(`🍾 Sent VIP drink to @${username}!`);
    close();
  };

  const handleUrgent2k = async () => {
    setBusy(true);
    try {
      await requestMoney(player.uid, 2_000, 'Urgent 2k abeg!');
      say(`🤲🏾 @${myUsername} to @${username}: "Chief, abeg borrow me 2k urgent! Fuel finish for keke and phone dey 2%!" 😭🙏🏾`);
      toast(`🤲🏾 Urgent 2k plea sent to @${username}!`);
      close();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not request 2k');
      setBusy(false);
    }
  };

  const handleDropBanger = () => {
    const cost = 1_000;
    if (money < cost) return toast(`You need ${naira(cost)} to buy a knockout banger!`);
    charge(cost, 'Knockout firecracker');
    say(`💥 KPAAAA! @${myUsername} dropped a loud knockout banger at @${username}'s feet! They jumped 3 feet into the air! 😂🏃🏾💨`);
    toast(`💥 Knockout banger exploded at @${username}'s feet! Total confusion!`);
    close();
  };

  const handleHypeUp = () => {
    say(`📣 ATTENTION! @${myUsername}: "Make way for @${username}! Number one baller and highest Odogwu in ${cityNameHere()}! E choke!" 🦁👑✨`);
    toast(`📣 You hyped up @${username} in front of the whole town!`);
    close();
  };

  const handleRateDrip = () => {
    const critique = DRIP_REVIEWS[Math.floor(Math.random() * DRIP_REVIEWS.length)];
    say(`🕶️ DRIP CHECK! @${myUsername} inspected @${username}'s drip: "${critique}" 👔✨`);
    toast(`🕶️ Rated @${username}'s drip!`);
    close();
  };

  return (
    <div className="player-sheet-backdrop" onClick={close}>
      <section
        className="player-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Interact with ${username}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="player-sheet-head">
          <Face uid={player.uid} username={username} look={player.look} className="player-sheet-avatar" />
          <div>
            <b>{alias ?? `@${username}`}</b>
            {alias ? <small>@{username}</small> : player.name && player.name !== username && <small>{player.name}</small>}
          </div>
          <button className="x" aria-label="Close interactions" onClick={close}>
            ×
          </button>
        </header>

        {action === 'actions' && (
          <div className="player-cat-tabs">
            <button
              className={`player-cat-tab ${category === 'wild' ? 'active' : ''}`}
              onClick={() => setCategory('wild')}
            >
              ⚡ Wild & Drama
            </button>
            <button
              className={`player-cat-tab ${category === 'standard' ? 'active' : ''}`}
              onClick={() => setCategory('standard')}
            >
              💼 Chat & Crime
            </button>
            <button
              className={`player-cat-tab ${category === 'profile' ? 'active' : ''}`}
              onClick={() => setCategory('profile')}
            >
              👤 Profile
            </button>
          </div>
        )}

        {action === 'actions' && category === 'profile' ? (
          <PlayerProfile player={player} canChat={!!me && connected} onChat={startChat} />
        ) : action === 'actions' && category === 'wild' ? (
          <div className="player-action-grid wild-grid">
            <button
              className="player-wild-btn spray"
              disabled={!me || !connected || busy}
              onClick={() => setAction('spray')}
            >
              <span className="wild-btn-icon">💸</span>
              <b>Spray Cash</b>
              <small>Odogwu Dorime spray</small>
            </button>

            <button
              className="player-wild-btn slap"
              disabled={!me || !connected || busy}
              onClick={handleCashSlap}
            >
              <span className="wild-btn-icon">👋🏾</span>
              <b>Cash Slap</b>
              <small>Slap with ₦5k bundle</small>
            </button>

            <button
              className="player-wild-btn dance"
              disabled={!me || !connected || busy}
              onClick={handleDanceBattle}
            >
              <span className="wild-btn-icon">🕺🏾</span>
              <b>Dance Battle</b>
              <small>Poco Lee legwork</small>
            </button>

            <button
              className="player-wild-btn drink"
              disabled={!me || !connected || busy}
              onClick={handleSendDrink}
            >
              <span className="wild-btn-icon">🍾</span>
              <b>VIP Drink</b>
              <small>Send Ace of Spades (₦5k)</small>
            </button>

            <button
              className="player-wild-btn banger"
              disabled={!me || !connected || busy}
              onClick={handleDropBanger}
            >
              <span className="wild-btn-icon">💥</span>
              <b>Drop Banger</b>
              <small>Knockout banger (₦1k)</small>
            </button>

            <button
              className="player-wild-btn urgent"
              disabled={!me || !connected || busy}
              onClick={handleUrgent2k}
            >
              <span className="wild-btn-icon">🤲🏾</span>
              <b>Urgent 2k</b>
              <small>Send ₦2k plea</small>
            </button>

            <button
              className="player-wild-btn hype"
              disabled={!me || !connected || busy}
              onClick={handleHypeUp}
            >
              <span className="wild-btn-icon">📣</span>
              <b>Hype Up</b>
              <small>Praise the Odogwu</small>
            </button>

            <button
              className="player-wild-btn drip"
              disabled={!me || !connected || busy}
              onClick={handleRateDrip}
            >
              <span className="wild-btn-icon">🕶️</span>
              <b>Rate Drip</b>
              <small>Nigerian fashion police</small>
            </button>
          </div>
        ) : action === 'actions' && category === 'standard' ? (
          <div className="player-action-grid">
            <button disabled={!me || !connected} onClick={startChat}>
              💬 Chat
            </button>
            <button disabled={!me || !connected || busy} onClick={() => void inviteHome(player.uid)}>
              🏠 Invite home
            </button>
            <button disabled={!me || !connected} onClick={() => setAction('request')}>
              🧾 Ask money
            </button>
            <button disabled={!me || !connected} onClick={() => setAction('send')}>
              💸 Send money
            </button>
            <button
              className="player-steal"
              disabled={!me || !connected || busyStealing}
              onClick={() => void steal(player.uid, username, 'pickpocket')}
            >
              🥷 Pickpocket
            </button>
            {gun && (
              <>
                <button
                  className="player-steal"
                  disabled={!me || !connected || busyGun || gun.ammo < GUNS[gun.id].rounds}
                  onClick={() => { close(); void robAtGunpoint(player.uid, username); }}
                >
                  🔫 Rob at gunpoint
                </button>
                <button
                  className="player-steal"
                  disabled={!me || !connected || busyGun || gun.ammo < GUNS[gun.id].rounds}
                  onClick={() => { close(); void shootPlayer(player.uid, username); }}
                >
                  💥 Shoot{gun.ammo < GUNS[gun.id].rounds ? ' · no rounds' : ''}
                </button>
              </>
            )}
            {wanted && (officer || wanted.bounty > 0) && (
              <button
                className="player-steal"
                disabled={!me || !connected || busyStealing}
                onClick={() => {
                  close();
                  void arrestPlayer(player.uid, username);
                }}
              >
                {officer ? '👮🏾 Arrest' : `🤠 Arrest · ${naira(wanted.bounty)} bounty`}
              </button>
            )}
            {jailed && (
              <button
                disabled={!me || !connected || busyStealing}
                onClick={() => {
                  close();
                  void payBail(player.uid, username);
                }}
              >
                🔓 Bail {naira(bailFor(jailed.until))}
              </button>
            )}
          </div>
        ) : action === 'spray' ? (
          <div className="player-spray-picker">
            <button
              type="button"
              className="msg-back"
              onClick={() => {
                setAction('actions');
                setError(null);
              }}
            >
              ‹ Back
            </button>
            <b>Spray crisp Naira notes on @{username}</b>
            <p className="muted small">Dorime alerts and cash showers visible to everyone!</p>

            <div className="spray-pills-grid">
              <button
                className="spray-pill"
                disabled={busy || money < 2_000}
                onClick={() => handleSprayAmount(2_000)}
              >
                <b>₦2,000</b>
                <small>Quick flex</small>
              </button>
              <button
                className="spray-pill highlight"
                disabled={busy || money < 5_000}
                onClick={() => handleSprayAmount(5_000)}
              >
                <b>₦5,000</b>
                <small>Odogwu spray</small>
              </button>
              <button
                className="spray-pill gold"
                disabled={busy || money < 20_000}
                onClick={() => handleSprayAmount(20_000)}
              >
                <b>₦20,000</b>
                <small>Chief baller</small>
              </button>
              <button
                className="spray-pill purple"
                disabled={busy || money < 50_000}
                onClick={() => handleSprayAmount(50_000)}
              >
                <b>₦50,000</b>
                <small>Dorime heavy!</small>
              </button>
            </div>

            <small className="muted" style={{ marginTop: 8 }}>Your balance: {naira(money)}</small>
          </div>
        ) : (
          <form className="player-money-form" onSubmit={submitMoney}>
            <button
              type="button"
              className="msg-back"
              onClick={() => {
                setAction('actions');
                setError(null);
              }}
            >
              ‹ Actions
            </button>
            <b>{action === 'send' ? 'Send money' : 'Ask for money'}</b>
            <div className="amount-input">
              <span>₦</span>
              <input
                autoFocus
                inputMode="numeric"
                min="1"
                placeholder="0"
                value={value ? value.toLocaleString() : ''}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError(null);
                }}
              />
            </div>
            <input
              className="note-input"
              maxLength={140}
              placeholder="Note (optional)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <small className={action === 'send' && value > money ? 'bad' : 'muted'}>
              {action === 'send' ? `Balance ${naira(money)}` : `Request from @${username}`}
            </small>
            {error && <p className="auth-msg">{error}</p>}
            <button
              className="btn wide go"
              disabled={busy || value < 1 || (action === 'send' && value > money)}
            >
              {busy ? 'Sending…' : action === 'send' ? 'Send' : 'Request'}
            </button>
          </form>
        )}
        {!me && <small className="muted">Sign in to interact.</small>}
        {error && action === 'actions' && <p className="auth-msg">{error}</p>}
      </section>
    </div>
  );
}

/** Who this player is, plus my own nickname for them. */
function PlayerProfile({ player, canChat, onChat }: { player: PlayerRef; canChat: boolean; onChat(): void }) {
  const live = useNet((s) => s.players[player.uid]);
  const alias = useGame((s) => s.aliases[player.uid] ?? '');
  const setAlias = useGame((s) => s.setAlias);
  const [draft, setDraft] = useState(alias);
  const [plots, setPlots] = useState<number | null>(null);
  const username = player.username;
  const name = player.name ?? live?.name;

  useEffect(() => setDraft(alias), [alias, player.uid]);
  useEffect(() => {
    setPlots(null);
    if (!username) return;
    let stale = false;
    fetch(`/api/profile/${username}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((p: { plots?: number } | null) => { if (!stale && p) setPlots(p.plots ?? 0); })
      .catch(() => {});
    return () => { stale = true; };
  }, [username]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    setAlias(player.uid, draft);
  };

  return (
    <div className="player-profile">
      {live?.look && <PersonPreview look={live.look} height={190} />}
      <div className="profile-id">
        <b>{alias || name || `@${username ?? 'player'}`}</b>
        <span>@{username ?? 'player'}</span>
        {name && name !== username && alias && <span>{name}</span>}
        <span className={live ? 'online-label' : 'muted'}>{live ? 'Online' : 'Offline'}</span>
        {plots !== null && <span>🏠 {plots} {plots === 1 ? 'plot' : 'plots'}</span>}
      </div>
      <form className="player-alias" onSubmit={save}>
        <label htmlFor="player-alias">Nickname</label>
        <div>
          <input
            id="player-alias"
            className="text-input"
            maxLength={ALIAS_MAX}
            placeholder="e.g. Musa from the mall"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="btn sm go" disabled={draft.trim() === alias}>
            {alias && !draft.trim() ? 'Clear' : 'Save'}
          </button>
        </div>
        <small className="muted">Only you see this. It shows in place of their @username.</small>
      </form>
      <div className="player-action-grid">
        <button disabled={!canChat} onClick={onChat}>
          💬 Chat
        </button>
        {username && (
          <button onClick={() => void shareLink(userLink(username), `@${username} on Naija City`)}>
            🔗 Share profile
          </button>
        )}
      </div>
    </div>
  );
}
