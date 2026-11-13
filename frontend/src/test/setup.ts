import { afterEach } from 'vitest';

// The browser-only setup is skipped for tests that opt into `@vitest-environment node` (e.g. the live contract test).
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());

  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
  }
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
}
