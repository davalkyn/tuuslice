import { NEON, finePointer, makeGlowSprite, pick, reduceMotion } from "./env";

/* ---------------- floating neon dust (site-wide background) ---------------- */

interface Mote {
  x: number;
  y: number;
  r: number;
  a: number;
  phase: number;
  tw: number;
  vx: number;
  vy: number;
  depth: number;
  sprite: HTMLCanvasElement;
}

interface Streak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export function initBackground() {
  const canvas = document.getElementById("bg-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;

  const sprites = {
    pink: makeGlowSprite(32, NEON.pink),
    orange: makeGlowSprite(32, NEON.orange),
    sun: makeGlowSprite(32, NEON.sun),
    teal: makeGlowSprite(32, NEON.teal),
    violet: makeGlowSprite(32, NEON.violet),
  };
  const spriteWeights: [HTMLCanvasElement, number][] = [
    [sprites.pink, 3],
    [sprites.orange, 2],
    [sprites.sun, 2],
    [sprites.teal, 2],
    [sprites.violet, 1],
  ];

  let w = 0;
  let h = 0;
  let motes: Mote[] = [];
  const streaks: Streak[] = [];
  let shiftX = 0;
  let shiftY = 0;
  let targetX = 0;
  let targetY = 0;
  let lastScroll = window.scrollY;
  let frame = 0;

  const spawn = (anywhere: boolean): Mote => ({
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : h + 12,
    r: Math.random() * 1.6 + 0.4,
    a: Math.random() * 0.5 + 0.2,
    phase: Math.random() * Math.PI * 2,
    tw: Math.random() * 0.02 + 0.006,
    vx: (Math.random() - 0.5) * 0.08,
    vy: -(Math.random() * 0.2 + 0.05),
    depth: Math.random() * 0.7 + 0.2,
    sprite: pick(spriteWeights),
  });

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas!.width = Math.round(w * dpr);
    canvas!.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(130, Math.max(45, Math.round((w * h) / 13000)));
    motes = Array.from({ length: count }, () => spawn(true));
  }

  function draw(t: number) {
    ctx.clearRect(0, 0, w, h);
    const scroll = window.scrollY;
    const dScroll = scroll - lastScroll;
    lastScroll = scroll;

    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      if (!reduceMotion) {
        m.x += m.vx;
        m.y += m.vy * m.depth * 2 - dScroll * m.depth * 0.12;
        if (m.y < -20) motes[i] = spawn(false);
        else if (m.y > h + 20) {
          m.y = -10;
        }
      }
      const twinkle = Math.sin(t * m.tw * 0.06 + m.phase) * 0.35 + 0.65;
      const s = 6 + m.r * 9;
      ctx.globalAlpha = m.a * twinkle;
      ctx.drawImage(m.sprite, m.x + shiftX * m.depth - s / 2, m.y + shiftY * m.depth - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    if (!reduceMotion && Math.random() < 0.003 && streaks.length < 2) {
      streaks.push({ x: Math.random() * w * 0.7 + w * 0.15, y: -20, vx: 3 + Math.random() * 3, vy: 2.2 + Math.random() * 1.6, life: 1 });
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const st = streaks[i];
      st.x += st.vx * 4;
      st.y += st.vy * 4;
      st.life -= 0.018;
      if (st.life <= 0 || st.y > h + 40 || st.x > w + 40) {
        streaks.splice(i, 1);
        continue;
      }
      const g = ctx.createLinearGradient(st.x, st.y, st.x - st.vx * 16, st.y - st.vy * 16);
      g.addColorStop(0, `rgba(255,214,160,${st.life})`);
      g.addColorStop(0.4, `rgba(255,95,168,${st.life * 0.7})`);
      g.addColorStop(1, "rgba(255,45,135,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(st.x, st.y);
      ctx.lineTo(st.x - st.vx * 16, st.y - st.vy * 16);
      ctx.stroke();
    }
  }

  function tick(t: number) {
    shiftX += (targetX - shiftX) * 0.04;
    shiftY += (targetY - shiftY) * 0.04;
    draw(t);
    frame = requestAnimationFrame(tick);
  }

  size();
  if (reduceMotion) draw(0);
  else frame = requestAnimationFrame(tick);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      size();
      if (reduceMotion) draw(0);
    }, 150);
  });

  if (finePointer) {
    window.addEventListener(
      "mousemove",
      (e) => {
        targetX = (e.clientX / w - 0.5) * -34;
        targetY = (e.clientY / h - 0.5) * -34;
      },
      { passive: true },
    );
  }

  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(frame);
    if (!document.hidden && !reduceMotion) frame = requestAnimationFrame(tick);
  });
}

/* ---------------- custom cursor + neon spark trail ---------------- */

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  sprite: HTMLCanvasElement;
}

export function initCursor() {
  if (!finePointer) return;
  const canvas = document.getElementById("fx-canvas") as HTMLCanvasElement | null;
  const dot = document.getElementById("cursor-dot");
  const ring = document.getElementById("cursor-ring");
  if (!canvas || !dot || !ring) return;
  const ctx = canvas.getContext("2d")!;

  const sparkSprites: [HTMLCanvasElement, number][] = [
    [makeGlowSprite(16, NEON.hot), 3],
    [makeGlowSprite(16, NEON.orange), 2],
    [makeGlowSprite(16, NEON.teal), 2],
  ];

  let sparks: Spark[] = [];
  let mouseX = -100;
  let mouseY = -100;
  let dotX = -100;
  let dotY = -100;
  let ringX = -100;
  let ringY = -100;
  let frame = 0;
  let idle = 0;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas!.width = Math.round(window.innerWidth * dpr);
    canvas!.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener("resize", size);

  window.addEventListener(
    "mousemove",
    (e) => {
      if (mouseX < -50) {
        dotX = ringX = e.clientX;
        dotY = ringY = e.clientY;
        document.body.classList.add("cursor-ready");
      }
      mouseX = e.clientX;
      mouseY = e.clientY;
      idle = 0;
      if (!reduceMotion && Math.random() < 0.45) {
        sparks.push({
          x: mouseX,
          y: mouseY,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -Math.random() * 0.9 - 0.15,
          life: 1,
          r: Math.random() * 1.6 + 0.6,
          sprite: pick(sparkSprites),
        });
        if (sparks.length > 90) sparks.splice(0, sparks.length - 90);
      }
      if (!frame) frame = requestAnimationFrame(tick);
    },
    { passive: true },
  );

  document.documentElement.addEventListener("mouseleave", () => {
    mouseX = mouseY = -100;
    document.body.classList.remove("cursor-ready");
  });

  window.addEventListener("mousedown", () => {
    document.body.classList.add("cursor-down");
    if (reduceMotion) return;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      const speed = 1 + Math.random() * 1.4;
      sparks.push({ x: mouseX, y: mouseY, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 1, r: Math.random() * 2 + 1, sprite: pick(sparkSprites) });
    }
  });
  window.addEventListener("mouseup", () => document.body.classList.remove("cursor-down"));

  const hoverTargets = "a, button, [role='button'], summary, label, .glow-card";
  document.addEventListener("mouseover", (e) => {
    if ((e.target as Element).closest?.(hoverTargets)) document.body.classList.add("cursor-hover");
  });
  document.addEventListener("mouseout", (e) => {
    if ((e.target as Element).closest?.(hoverTargets)) document.body.classList.remove("cursor-hover");
  });

  function tick() {
    dotX += (mouseX - dotX) * 0.55;
    dotY += (mouseY - dotY) * 0.55;
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    dot!.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%)`;
    ring!.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.022;
      if (p.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      const s = p.r * p.life * 8;
      ctx.globalAlpha = p.life * 0.85;
      ctx.drawImage(p.sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // Sleep when the cursor has settled and the trail has faded.
    const settled = Math.abs(mouseX - ringX) < 0.3 && Math.abs(mouseY - ringY) < 0.3 && sparks.length === 0;
    if (settled && ++idle > 10) {
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      sparks = [];
    }
  });
}
