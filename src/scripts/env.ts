export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = window.matchMedia("(pointer: fine)").matches;

/** Pre-rendered radial glow, drawn with drawImage instead of costly shadowBlur. */
export function makeGlowSprite(size: number, rgb: string) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.35, `rgba(${rgb},0.55)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export const NEON = {
  pink: "255,45,135",
  hot: "255,95,168",
  orange: "255,122,61",
  sun: "255,179,71",
  teal: "34,228,217",
  violet: "123,92,255",
};

export function pick<T>(items: [T, number][]): T {
  let n = Math.random() * items.reduce((s, [, w]) => s + w, 0);
  for (const [item, w] of items) {
    if ((n -= w) <= 0) return item;
  }
  return items[0][0];
}
