import { create } from 'zustand';

/** Cards the neighbours shout when a thief is caught in a house. */
export const SHOUTS = [
  'We don catch thief! 🚨',
  'You go dance today! 💃🏾',
  'Make una come beat thief! 👊🏾',
  'Na today your matter finish!',
  'Oya hold am o! Hold am!',
  'Call police! Call police!',
  'Ole! Ole! Ole!',
  'Thief wey no get shame!',
  'Who send you come here?',
  'Open your mouth, wetin you carry?',
  'Una come see thief o!',
  'Today na today, my friend.',
  'Bring tyre! Bring petrol! 🔥 (Joke o, police go handle am)',
  'Na you dey disturb our area before!',
  'E don cast! 😂',
];

export type SceneOption = { label: string; result: string };
export type Scene = { id: string; who: string; icon: string; line: string; options: SceneOption[] };

/** "What are you doing here?" moments. The pick is flavour; the outcome of the catch is already decided. */
export const SCENES: Scene[] = [
  {
    id: 'owner', who: 'The house owner', icon: '😠',
    line: 'Ehn?! Who be you? Wetin you dey do for inside my house?',
    options: [
      { label: '“I come read the NEPA meter.”', result: 'Owner: “Meter dey outside! You dey read am with my television for your hand?”' },
      { label: '“Na wrong house I enter, abeg.”', result: 'Owner: “Through the window? Wrong house through the WINDOW?”' },
      { label: '“I be your cousin from village.”', result: 'Owner: “I no get cousin wey dey carry my generator!”' },
      { label: 'Run for the door', result: 'You slip on the rug. The whole street clap for the fall. 😭' },
    ],
  },
  {
    id: 'maigadi', who: 'The mai-gadi', icon: '🔦',
    line: 'Oga stop there! Which kain thing be this at this odd hour?',
    options: [
      { label: 'Offer him “small kola”', result: 'Mai-gadi: “Kola? Ah! Which kola? ...No. Duty is duty.” He still locks the gate.' },
      { label: 'Pretend to be a ghost', result: 'Mai-gadi: “Ghost wey wear Nike?” He is not impressed.' },
      { label: 'Faint', result: 'You fall down gently. He fans you for ten minutes, then calls police. Respect.' },
      { label: 'Say “I dey work for the owner”', result: 'Mai-gadi: “Which work? Work wey no get light?”' },
    ],
  },
  {
    id: 'crowd', who: 'Angry neighbours', icon: '📣',
    line: 'The whole compound has gathered round you. Somebody has a broom.',
    options: [
      { label: 'Shout “thief! thief!” and point behind them', result: 'Nobody looks back. Auntie Mama Put says: “Na you be the thief!”' },
      { label: 'Beg and cry', result: 'Somebody records you for TikTok. You are trending on Naija Twitter.' },
      { label: 'Hide in the wardrobe', result: 'Wardrobe door opens. “Haaaa, see ole!” They are thorough.' },
      { label: 'Ask for water', result: 'A small boy gives you water. Then drags you out by the shirt.' },
    ],
  },
  {
    id: 'camera', who: 'Voice from the CCTV speaker', icon: '📹',
    line: '“Good evening, thief. We see you. Wave to the camera.”',
    options: [
      { label: 'Wave', result: 'You wave. The owner screenshots it. This is going on the family WhatsApp group.' },
      { label: 'Cover your face with a cushion', result: 'Face covered, but the slippers are very, very recognisable.' },
      { label: 'Cut the wire', result: 'You cut the wrong wire. The generator goes off. The neighbours come out singing.' },
      { label: 'Bow and say “thank you for having me”', result: 'The voice laughs for a long time. Then goes quiet. Then: “Police don dey come.”' },
    ],
  },
];

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const shuffled = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);

type Caught = {
  active: boolean;
  /** Where a catch came from: the camera only exposes you; guards and police take you away. */
  cause: 'camera' | 'guard';
  shouts: string[];
  scene: Scene | null;
  options: SceneOption[];
  step: 'shouts' | 'ask' | 'result';
  result: string;
  /** An arrest the server already made, applied when the scene ends. */
  arrest: { until: number; officer?: string | null } | null;
  /** The owner beat me while the scene was playing; show the beaten toast when the scene ends instead. */
  beaten: { by: string; amount: number } | null;
};

export const useCaught = create<Caught>(() => ({ active: false, cause: 'guard', shouts: [], scene: null, options: [], step: 'shouts', result: '', arrest: null, beaten: null }));

/** Starts the scene once; a second call for the same catch is ignored. */
export function startCaughtScene(cause: 'camera' | 'guard') {
  if (useCaught.getState().active) return false;
  const scene = cause === 'camera' ? SCENES.find((s) => s.id === 'camera')! : pick(SCENES.filter((s) => s.id !== 'camera'));
  useCaught.setState({ active: true, cause, shouts: shuffled(SHOUTS).slice(0, 4), scene, options: shuffled(scene.options), step: 'shouts', result: '', arrest: null, beaten: null });
  return true;
}
