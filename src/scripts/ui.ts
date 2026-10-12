import Lenis from "lenis";
import { finePointer, reduceMotion } from "./env";

let lenis: Lenis | null = null;

export function initSmoothScroll() {
  if (reduceMotion || !finePointer) return;
  lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    anchors: { offset: -84 },
    autoRaf: true,
  });
}

export function initNav() {
  const nav = document.querySelector<HTMLElement>("[data-nav]");
  if (nav) {
    const onScroll = () => nav.classList.toggle("nav--scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  const toggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  const menu = document.querySelector<HTMLElement>("[data-menu]");
  if (!toggle || !menu) return;
  const label = toggle.querySelector(".sr-only");

  const setOpen = (open: boolean) => {
    toggle.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "Close menu" : "Open menu";
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (open) {
      lenis?.stop();
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add("mmenu--open"));
      menu.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    } else {
      lenis?.start();
      menu.classList.remove("mmenu--open");
      window.setTimeout(() => {
        if (!menu.classList.contains("mmenu--open")) menu.hidden = true;
      }, 400);
    }
  };

  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  menu.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia("(min-width: 1081px)").addEventListener("change", (e) => {
    if (e.matches) setOpen(false);
  });
}

/** Reveal-on-scroll, with automatic stagger for children of [data-reveal-group]. */
export function initReveal() {
  document.querySelectorAll<HTMLElement>("[data-reveal-group]").forEach((group) => {
    Array.from(group.children).forEach((child, i) => {
      const el = child as HTMLElement;
      el.setAttribute("data-reveal", "");
      el.style.setProperty("--reveal-delay", `${Math.min(i, 8) * 70}ms`);
    });
  });

  const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in-view"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  els.forEach((el) => io.observe(el));
}

/** Pointer-tracked spotlight on .glow-card, plus a gentle magnetic pull on [data-magnetic]. */
export function initGlow() {
  if (!finePointer) return;
  let pending: PointerEvent | null = null;
  let raf = 0;

  const update = () => {
    raf = 0;
    const e = pending;
    if (!e || !(e.target instanceof Element)) return;
    const card = e.target.closest<HTMLElement>(".glow-card");
    if (card) {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
    if (!reduceMotion) {
      const mag = e.target.closest<HTMLElement>("[data-magnetic]");
      if (mag) {
        const r = mag.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.18;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.28;
        mag.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      }
    }
  };

  document.addEventListener(
    "pointermove",
    (e) => {
      pending = e;
      if (!raf) raf = requestAnimationFrame(update);
    },
    { passive: true },
  );

  document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
    el.style.transition = `${getComputedStyle(el).transition}, translate 0.5s cubic-bezier(0.22, 1, 0.36, 1)`;
    el.addEventListener("pointerleave", () => {
      el.style.translate = "";
    });
  });
}
