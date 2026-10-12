import { finePointer, reduceMotion } from "./env";

/** Hero scene: twinkling sky, sun reflection on the water, pointer + scroll parallax. */
export function initHero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  const canvas = hero.querySelector<HTMLCanvasElement>("[data-hero-canvas]");
  const content = hero.querySelector<HTMLElement>("[data-hero-content]");
  const sun = hero.querySelector<HTMLElement>(".hero__sun-wrap");
  const layers = Array.from(hero.querySelectorAll<HTMLElement>("[data-depth]")).map((el) => ({
    el,
    depth: parseFloat(el.dataset.depth || "0"),
    scroll: parseFloat(el.dataset.scroll || "0"),
  }));
  const ctx = canvas?.getContext("2d") ?? null;

  let w = 0;
  let h = 0;
  let horizon = 0;
  let sunX = 0;
  let sunR = 0;
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  let inView = true;
  let frame = 0;

  const stars = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random() * 0.5,
    r: Math.random() * 1.1 + 0.3,
    p: Math.random() * Math.PI * 2,
    s: Math.random() * 0.002 + 0.0006,
  }));

  function measure() {
    if (!canvas || !ctx) return;
    const rect = hero!.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pct = parseFloat(getComputedStyle(hero!).getPropertyValue("--horizon")) || 74;
    horizon = (h * pct) / 100;
    if (sun) {
      const s = sun.getBoundingClientRect();
      sunX = s.left - rect.left + s.width / 2;
      sunR = s.width / 2;
    }
  }

  function draw(t: number) {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // stars in the upper sky
    for (const st of stars) {
      const a = (Math.sin(t * st.s + st.p) * 0.5 + 0.5) * 0.8 * (1 - st.y * 1.6);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#ffe9f4";
      ctx.beginPath();
      ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // sun reflection: shimmering horizontal streaks under the sun
    ctx.globalCompositeOperation = "lighter";
    const depth = h - horizon;
    let row = 0;
    for (let y = horizon + 3; y < h; y += 5, row++) {
      const d = (y - horizon) / depth;
      const fade = Math.pow(1 - d, 1.4);
      const wobble = Math.sin(t * 0.0016 + row * 1.7);
      const width = sunR * (1.15 - d * 0.55) * (0.55 + 0.45 * Math.abs(wobble));
      const cx = sunX + Math.sin(t * 0.0008 + row * 0.9) * 10 * (1 + d * 2);
      const alpha = fade * (0.35 + 0.35 * Math.sin(t * 0.003 + row * 2.3));
      if (alpha <= 0.02) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = d < 0.25 ? "#ffb347" : d < 0.5 ? "#ff7a3d" : "#ff2d87";
      const gap = width * 0.18 * (0.5 + 0.5 * Math.sin(t * 0.002 + row));
      const thick = 1.4 + (1 - d) * 1.4;
      ctx.fillRect(cx - width / 2, y, width / 2 - gap / 2, thick);
      ctx.fillRect(cx + gap / 2, y, width / 2 - gap / 2, thick);
    }

    // a few teal glints across the water
    for (let i = 0; i < 14; i++) {
      const gx = ((i * 137.5 + t * 0.01 * ((i % 3) + 1)) % (w + 60)) - 30;
      const gy = horizon + ((i * 53) % Math.max(1, depth - 10)) + 6;
      const a = (Math.sin(t * 0.004 + i * 2.1) * 0.5 + 0.5) * 0.4 * (1 - (gy - horizon) / depth);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#22e4d9";
      ctx.fillRect(gx, gy, 10 + (i % 4) * 6, 1.2);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  function applyParallax() {
    const scroll = Math.min(window.scrollY, h);
    for (const { el, depth, scroll: factor } of layers) {
      const x = -tx * depth * 28;
      const y = -ty * depth * 12 + scroll * factor;
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    }
    if (content) {
      const p = scroll / (h || 1);
      content.style.transform = `translate3d(0, ${(scroll * 0.22).toFixed(2)}px, 0)`;
      content.style.opacity = String(Math.max(0, 1 - p * 1.4));
    }
  }

  function tick(t: number) {
    tx += (px - tx) * 0.05;
    ty += (py - ty) * 0.05;
    applyParallax();
    draw(t);
    frame = inView && !document.hidden ? requestAnimationFrame(tick) : 0;
  }

  measure();

  if (reduceMotion) {
    draw(0);
    window.addEventListener("resize", () => {
      measure();
      draw(0);
    });
    return;
  }

  const start = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) start();
  }).observe(hero);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) start();
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 120);
  });

  if (finePointer) {
    hero.addEventListener(
      "pointermove",
      (e) => {
        px = (e.clientX / window.innerWidth - 0.5) * 2;
        py = (e.clientY / window.innerHeight - 0.5) * 2;
      },
      { passive: true },
    );
  }

  start();
}
