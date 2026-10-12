// Build-time generators for the original hero artwork (palms + skyline).
// Everything here is procedural SVG: no third-party or Rockstar assets.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
const f = (n: number) => Math.round(n * 10) / 10;

function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}
function quadTangent(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const x = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]);
  const y = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1]);
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

export interface Palm {
  viewBox: string;
  trunk: string;
  ribs: string;
  leaflets: string;
  nuts: Pt[];
}

/** A palm silhouette in a 400x720 box. `lean` bends the trunk (px at the crown). */
export function makePalm(seed: number, lean = 60): Palm {
  const r = rng(seed);
  const base: Pt = [200 - lean * 0.35, 720];
  const crown: Pt = [200 + lean * 0.65, 150];
  const ctrl: Pt = [200 + lean * 0.05, 430];

  // Tapered trunk polygon around a curved centerline.
  const left: Pt[] = [];
  const right: Pt[] = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = quad(base, ctrl, crown, t);
    const tan = quadTangent(base, ctrl, crown, t);
    const nx = -tan[1];
    const ny = tan[0];
    // slight ring bumps for texture
    const bump = i % 3 === 0 ? 1.4 : 0;
    const w = (15 - t * 7.5) + bump;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }
  const trunk =
    "M" + left.map((p) => `${f(p[0])} ${f(p[1])}`).join("L") + "L" + right.reverse().map((p) => `${f(p[0])} ${f(p[1])}`).join("L") + "Z";

  // Fronds radiating from the crown.
  const angles = [-176, -152, -128, -104, -82, -58, -34, -8, 158, 22, 182, -2];
  let ribs = "";
  let leaflets = "";
  for (const deg of angles) {
    const a = ((deg + (r() - 0.5) * 10) * Math.PI) / 180;
    const L = 150 + r() * 70;
    const dir: Pt = [Math.cos(a), Math.sin(a)];
    const droop = L * (0.42 + r() * 0.2);
    const tip: Pt = [crown[0] + dir[0] * L, crown[1] + dir[1] * L + droop];
    const cp: Pt = [crown[0] + dir[0] * L * 0.55, crown[1] + dir[1] * L * 0.55 - L * 0.12];
    ribs += `M${f(crown[0])} ${f(crown[1])}Q${f(cp[0])} ${f(cp[1])} ${f(tip[0])} ${f(tip[1])}`;

    for (let t = 0.1; t <= 0.98; t += 0.042) {
      const q = quad(crown, cp, tip, t);
      const tan = quadTangent(crown, cp, tip, t);
      const len = 52 * (Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.85 + 0.15);
      for (const side of [1, -1]) {
        const ang = (side * 62 * Math.PI) / 180;
        let dx = tan[0] * Math.cos(ang) - tan[1] * Math.sin(ang);
        let dy = tan[0] * Math.sin(ang) + tan[1] * Math.cos(ang);
        dy += 0.75; // gravity
        const m = Math.hypot(dx, dy) || 1;
        dx /= m;
        dy /= m;
        const l = len * (0.85 + r() * 0.3);
        leaflets += `M${f(q[0])} ${f(q[1])}l${f(dx * l)} ${f(dy * l)}`;
      }
    }
  }

  const nuts: Pt[] = [
    [crown[0] - 9, crown[1] + 14],
    [crown[0] + 7, crown[1] + 17],
    [crown[0] - 1, crown[1] + 26],
  ];

  return { viewBox: "0 0 400 720", trunk, ribs, leaflets, nuts };
}

export interface Skyline {
  viewBox: string;
  buildings: string;
  windows: { x: number; y: number; w: number; h: number; c: string }[];
}

/** A city skyline silhouette, 1600 wide. Tall towers cluster around `downtown` (0-1). */
export function makeSkyline(seed: number, opts: { height?: number; downtown?: number; density?: number; windows?: number } = {}): Skyline {
  const r = rng(seed);
  const H = opts.height ?? 320;
  const downtown = opts.downtown ?? 0.3;
  const W = 1600;
  let x = -10;
  let d = "";
  const windows: Skyline["windows"] = [];
  const colors = ["#ff5fa8", "#ffb347", "#22e4d9", "#ffd6a0", "#ff7a3d"];

  while (x < W + 10) {
    const w = 26 + r() * 64;
    const center = x / W;
    const near = Math.exp(-Math.pow((center - downtown) / 0.16, 2)) + 0.5 * Math.exp(-Math.pow((center - (downtown + 0.45)) / 0.12, 2));
    const h = Math.min(H - 10, 30 + r() * 70 + near * (opts.density ?? 1) * (90 + r() * 150));
    const top = H - h;
    d += `M${f(x)} ${H}V${f(top)}H${f(x + w)}V${H}Z`;

    // stepped art-deco crowns and antennas
    if (h > 120 && r() > 0.45) {
      const sw = w * (0.45 + r() * 0.25);
      const sx = x + (w - sw) / 2;
      const sh = 10 + r() * 22;
      d += `M${f(sx)} ${f(top)}V${f(top - sh)}H${f(sx + sw)}V${f(top)}Z`;
      if (r() > 0.4) {
        const ax = sx + sw / 2;
        d += `M${f(ax - 1.2)} ${f(top - sh)}V${f(top - sh - 18 - r() * 30)}H${f(ax + 1.2)}V${f(top - sh)}Z`;
      }
    }

    const winChance = opts.windows ?? 0.1;
    if (winChance > 0) {
      for (let wy = top + 8; wy < H - 6; wy += 9) {
        for (let wx = x + 5; wx < x + w - 6; wx += 8) {
          if (r() < winChance) {
            windows.push({ x: f(wx), y: f(wy), w: 3, h: 4, c: colors[Math.floor(r() * colors.length)] });
          }
        }
      }
    }

    x += w + (r() > 0.75 ? 4 + r() * 10 : 0);
  }

  return { viewBox: `0 0 ${W} ${H}`, buildings: d, windows };
}
