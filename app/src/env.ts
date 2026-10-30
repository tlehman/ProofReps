// Where the site lives: "/ProofReps" in production (app.json experiments.baseUrl).
const BASE = (process.env.EXPO_BASE_URL ?? "").replace(/\/$/, "");

// Absolute URL of a file in public/.
export const asset = (path: string) => new URL(`${BASE}/${path}`, globalThis.location?.origin ?? "http://localhost").href;
