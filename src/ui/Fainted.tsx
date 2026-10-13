import { HOSPITAL_BILL, HUNGER_WARN, useFainted } from '../game/fainted';
import { naira } from '../game/store';
import './fainted.css';

/** Shown when you wake up in hospital: why you are there, what it cost, and how to stay out next time. */
export function Fainted() {
  const report = useFainted((s) => s.report);
  if (!report) return null;
  const close = () => useFainted.setState({ report: null });
  return (
    <div className="fainted" role="alertdialog" aria-label="You fainted from hunger">
      <div className="fainted-card">
        <div className="fainted-head">
          <span aria-hidden="true">🚑</span>
          <div>
            <b>You fainted from hunger</b>
            <small>Your Hunger bar ran out, so you passed out and people rushed you to {report.hospital}.</small>
          </div>
        </div>
        <div className="fainted-bill">
          <span>Hospital bill</span>
          <b>{naira(HOSPITAL_BILL)}</b>
        </div>
        <p>
          {report.debt > 0
            ? `You only had ${naira(report.paid)} on you, so the other ${naira(report.debt)} is now debt you owe. `
            : `${naira(report.paid)} has been taken from your money. `}
          The doctors fed and treated you, so all your bars are full again.
        </p>
        <b className="fainted-sub">How to stay out of hospital</b>
        <ul>
          <li>🍛 Eat before the Hunger bar gets low. You are warned under {HUNGER_WARN.low}, and again under {HUNGER_WARN.faint} just before you faint.</li>
          <li>🍳 At home, cook or eat what is in the house. Out in town, grab Mai Shayi or market snacks.</li>
          <li>🛍️ Anywhere, order food on your phone in Jumia. It takes a while to arrive, so order early.</li>
          <li>⚡ Food gives you a little Energy too.</li>
        </ul>
        <button className="btn" onClick={close}>Got it</button>
      </div>
    </div>
  );
}
