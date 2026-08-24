(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------------- starfield background ---------------- */

  const bgCanvas = document.getElementById("bg-canvas");
  const bgCtx = bgCanvas.getContext("2d");

  let stars = [];
  let shootingStars = [];
  let w = 0, h = 0, dpr = 1;
  let pointerX = 0, pointerY = 0;
  let targetShiftX = 0, targetShiftY = 0, shiftX = 0, shiftY = 0;

  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    bgCanvas.width = w * dpr;
    bgCanvas.height = h * dpr;
    bgCanvas.style.width = w + "px";
    bgCanvas.style.height = h + "px";
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeStars() {
    const area = w * h;
    const count = Math.min(220, Math.max(70, Math.round(area / 9000)));
    stars = new Array(count).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.4 + 0.3,
      baseAlpha: Math.random() * 0.6 + 0.3,
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.015 + 0.006,
      depth: Math.random() * 0.6 + 0.2,
      hue: Math.random() > 0.75 ? "amber" : "gold",
    }));
  }

  function maybeSpawnShootingStar() {
    if (reduceMotion) return;
    if (Math.random() < 0.0035 && shootingStars.length < 2) {
      const startX = Math.random() * w * 0.6 + w * 0.2;
      shootingStars.push({
        x: startX,
        y: -20,
        vx: 4 + Math.random() * 3,
        vy: 3 + Math.random() * 2,
        life: 1,
      });
    }
  }

  let bgFrame = 0;

  function drawStars(t) {
    bgCtx.clearRect(0, 0, w, h);

    for (const s of stars) {
      const twinkle = Math.sin(t * s.twinkleSpeed + s.phase) * 0.35 + 0.65;
      const alpha = s.baseAlpha * twinkle;
      const dx = shiftX * s.depth;
      const dy = shiftY * s.depth;
      const color = s.hue === "amber" ? "255,184,77" : "242,193,78";

      bgCtx.beginPath();
      bgCtx.fillStyle = `rgba(${color},${alpha})`;
      bgCtx.shadowColor = `rgba(${color},${Math.min(alpha, 0.8)})`;
      bgCtx.shadowBlur = s.r > 1 ? 6 : 2;
      bgCtx.arc(s.x + dx, s.y + dy, s.r, 0, Math.PI * 2);
      bgCtx.fill();
    }
    bgCtx.shadowBlur = 0;

    maybeSpawnShootingStar();
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const st = shootingStars[i];
      st.x += st.vx * 4;
      st.y += st.vy * 4;
      st.life -= 0.02;
      if (st.life <= 0 || st.y > h + 40 || st.x > w + 40) {
        shootingStars.splice(i, 1);
        continue;
      }
      const grad = bgCtx.createLinearGradient(st.x, st.y, st.x - st.vx * 14, st.y - st.vy * 14);
      grad.addColorStop(0, `rgba(255,217,122,${st.life})`);
      grad.addColorStop(1, "rgba(255,217,122,0)");
      bgCtx.strokeStyle = grad;
      bgCtx.lineWidth = 2;
      bgCtx.beginPath();
      bgCtx.moveTo(st.x, st.y);
      bgCtx.lineTo(st.x - st.vx * 14, st.y - st.vy * 14);
      bgCtx.stroke();
    }
  }

  function bgTick(t) {
    shiftX += (targetShiftX - shiftX) * 0.04;
    shiftY += (targetShiftY - shiftY) * 0.04;
    drawStars(t);
    bgFrame = requestAnimationFrame(bgTick);
  }

  sizeCanvas();
  makeStars();
  if (reduceMotion) {
    drawStars(0);
  } else {
    bgFrame = requestAnimationFrame(bgTick);
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      sizeCanvas();
      makeStars();
      if (reduceMotion) drawStars(0);
    }, 150);
  });

  window.addEventListener("mousemove", (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    targetShiftX = ((pointerX / w) - 0.5) * -30;
    targetShiftY = ((pointerY / h) - 0.5) * -30;
  }, { passive: true });

  /* ---------------- custom cursor + ember trail ---------------- */

  const fxCanvas = document.getElementById("fx-canvas");
  const fxCtx = fxCanvas.getContext("2d");
  const cursorDot = document.getElementById("cursor-dot");
  const cursorRing = document.getElementById("cursor-ring");

  let embers = [];
  let dotX = 0, dotY = 0, ringX = 0, ringY = 0;
  let mouseX = -100, mouseY = -100;
  let fxFrame = 0;
  let fxTick = null;

  function sizeFx() {
    fxCanvas.width = window.innerWidth * dpr;
    fxCanvas.height = window.innerHeight * dpr;
    fxCanvas.style.width = window.innerWidth + "px";
    fxCanvas.style.height = window.innerHeight + "px";
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  if (finePointer) {
    document.body.classList.add("cursor-ready");
    sizeFx();
    window.addEventListener("resize", sizeFx);

    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!reduceMotion && Math.random() < 0.5) {
        embers.push({
          x: mouseX,
          y: mouseY,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -Math.random() * 0.8 - 0.2,
          life: 1,
          r: Math.random() * 1.6 + 0.6,
        });
        if (embers.length > 120) embers.splice(0, embers.length - 120);
      }
    }, { passive: true });

    window.addEventListener("mousedown", () => {
      document.body.classList.add("cursor-down");
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 * i) / 10;
        embers.push({
          x: mouseX,
          y: mouseY,
          vx: Math.cos(angle) * (1 + Math.random()),
          vy: Math.sin(angle) * (1 + Math.random()),
          life: 1,
          r: Math.random() * 2 + 1,
        });
      }
    });
    window.addEventListener("mouseup", () => document.body.classList.remove("cursor-down"));

    const hoverTargets = "a, button";
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest && e.target.closest(hoverTargets)) {
        document.body.classList.add("cursor-hover");
      }
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest && e.target.closest(hoverTargets)) {
        document.body.classList.remove("cursor-hover");
      }
    });

    fxTick = function () {
      dotX += (mouseX - dotX) * 0.55;
      dotY += (mouseY - dotY) * 0.55;
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      cursorDot.style.transform = `translate(${dotX}px, ${dotY}px) translate(-50%, -50%)`;
      cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;

      fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) {
          embers.splice(i, 1);
          continue;
        }
        fxCtx.beginPath();
        fxCtx.fillStyle = `rgba(255,184,77,${p.life * 0.8})`;
        fxCtx.shadowColor = "rgba(255,184,77,0.8)";
        fxCtx.shadowBlur = 6;
        fxCtx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        fxCtx.fill();
      }
      fxCtx.shadowBlur = 0;

      fxFrame = requestAnimationFrame(fxTick);
    }
    fxFrame = requestAnimationFrame(fxTick);
  }

  /* pause rAF loops when tab hidden */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(bgFrame);
      cancelAnimationFrame(fxFrame);
    } else {
      if (!reduceMotion) bgFrame = requestAnimationFrame(bgTick);
      if (finePointer) fxFrame = requestAnimationFrame(fxTick);
    }
  });

  /* ---------------- scroll reveal ---------------- */

  const revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  /* ---------------- solana copy-to-clipboard ---------------- */

  const solBtn = document.getElementById("sol-copy");
  const solCta = document.getElementById("sol-cta");
  if (solBtn) {
    solBtn.addEventListener("click", async () => {
      const address = solBtn.dataset.address;
      try {
        await navigator.clipboard.writeText(address);
      } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = address;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      solBtn.classList.add("copied");
      const prevLabel = solCta.textContent;
      solCta.textContent = "Copied!";
      setTimeout(() => {
        solBtn.classList.remove("copied");
        solCta.textContent = prevLabel;
      }, 1600);
    });
  }

  /* ---------------- business email: scramble-decrypt + copy ---------------- */

  function scrambleReveal(el, text, frameDelay, onDone) {
    const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ01!@#$%&*<>[]{}/\\";
    const totalFrames = Math.max(text.length * 2, 18);
    let frame = 0;
    const tick = () => {
      let out = "";
      const revealCount = Math.floor((frame / totalFrames) * text.length);
      for (let i = 0; i < text.length; i++) {
        out += i < revealCount || text[i] === " " ? text[i] : glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      el.textContent = out;
      frame++;
      if (frame > totalFrames) {
        el.textContent = text;
        if (onDone) onDone();
      } else {
        setTimeout(tick, frameDelay);
      }
    };
    tick();
  }

  const bizBtn = document.getElementById("biz-copy");
  const bizDisplay = document.getElementById("biz-email-display");
  const bizCta = document.getElementById("biz-cta");
  if (bizBtn) {
    bizBtn.addEventListener("click", async () => {
      const email = bizBtn.dataset.email;

      try {
        await navigator.clipboard.writeText(email);
      } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = email;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }

      if (reduceMotion) {
        bizDisplay.textContent = email;
      } else {
        bizCta.textContent = "Decrypting…";
        scrambleReveal(bizDisplay, email, 28, () => {
          bizBtn.classList.add("copied");
          bizCta.textContent = "Copied!";
          setTimeout(() => {
            bizBtn.classList.remove("copied");
            bizCta.textContent = "Email →";
          }, 1600);
        });
        return;
      }

      bizBtn.classList.add("copied");
      bizCta.textContent = "Copied!";
      setTimeout(() => {
        bizBtn.classList.remove("copied");
        bizCta.textContent = "Email →";
      }, 1600);
    });
  }
})();
