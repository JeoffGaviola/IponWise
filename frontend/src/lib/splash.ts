/** Minimum display durations for session transitions; tests run with no delay. */
const isTest = typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE === 'test';
export const SPLASH_MS = { enter: isTest ? 0 : 1700, leave: isTest ? 0 : 1400, maxWait: 12000 };
