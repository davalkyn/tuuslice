import { initBackground, initCursor } from "./fx";
import { initHero } from "./hero";
import { initLive } from "./live";
import { initGlow, initNav, initReveal, initSmoothScroll } from "./ui";
import { initCopy, initCountdown, initFilters, initSchedule, initVideoFacades } from "./widgets";

declare global {
  interface Window {
    __revealFallback?: number;
  }
}

window.clearTimeout(window.__revealFallback);

const safely = (fn: () => void) => {
  try {
    fn();
  } catch (err) {
    console.error(err);
  }
};

[
  initReveal,
  initNav,
  initSmoothScroll,
  initGlow,
  initCountdown,
  initSchedule,
  initCopy,
  initVideoFacades,
  initFilters,
  initLive,
  initHero,
  initBackground,
  initCursor,
].forEach(safely);
