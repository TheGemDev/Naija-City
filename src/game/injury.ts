// A burglar the homeowner caught is injured for a while (src/game/crime.ts CATCH). Plain mutable state, like
// `avatar`, so the per-frame walking code can read it without a React re-render.

export const injury = { until: 0 };

export const injured = () => injury.until > Date.now();
