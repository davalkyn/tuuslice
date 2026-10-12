import { reduceMotion } from "./env";

/* ---------------- launch countdown (to local midnight on launch day) ---------------- */

export function initCountdown() {
  document.querySelectorAll<HTMLElement>("[data-countdown]").forEach((root) => {
    const [y, m, d] = (root.dataset.countdown || "").split("-").map(Number);
    if (!y || !m || !d) return;
    const target = new Date(y, m - 1, d, 0, 0, 0).getTime();
    const units = root.querySelector<HTMLElement>("[data-countdown-units]");
    const caption = root.querySelector<HTMLElement>("[data-countdown-caption]");
    const out = root.querySelector<HTMLElement>("[data-countdown-out]");
    const nums: Record<string, HTMLElement | null> = {};
    for (const key of ["days", "hours", "minutes", "seconds"]) nums[key] = root.querySelector(`[data-unit="${key}"]`);
    const prev: Record<string, string> = {};

    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        if (units) units.hidden = true;
        if (caption) caption.hidden = true;
        if (out) out.hidden = false;
        return false;
      }
      const s = Math.floor(diff / 1000);
      const values: Record<string, number> = {
        days: Math.floor(s / 86400),
        hours: Math.floor((s % 86400) / 3600),
        minutes: Math.floor((s % 3600) / 60),
        seconds: s % 60,
      };
      for (const key in values) {
        const el = nums[key];
        if (!el) continue;
        const text = String(values[key]).padStart(2, "0");
        if (prev[key] === text) continue;
        el.textContent = text;
        if (prev[key] !== undefined && !reduceMotion) {
          el.classList.remove("tick");
          void el.offsetWidth;
          el.classList.add("tick");
        }
        prev[key] = text;
      }
      return true;
    };

    if (tick()) {
      const id = window.setInterval(() => {
        if (!tick()) window.clearInterval(id);
      }, 1000);
    }
  });
}

/* ---------------- stream schedule in the viewer's own time zone ---------------- */

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function tzOffset(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - date.getTime();
}

function nextOccurrence(day: string, start: string, durationMin: number, timeZone: string, now = Date.now()) {
  const dow = DAYS.indexOf(day.toLowerCase());
  const [hh, mm] = start.split(":").map(Number);
  if (dow < 0 || Number.isNaN(hh)) return null;
  const offset = tzOffset(new Date(now), timeZone);
  const wall = new Date(now + offset);
  let ahead = (dow - wall.getUTCDay() + 7) % 7;
  for (let attempt = 0; attempt < 2; attempt++) {
    const wallStart = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + ahead, hh, mm || 0);
    const startUtc = wallStart - tzOffset(new Date(wallStart - offset), timeZone);
    const endUtc = startUtc + durationMin * 60_000;
    if (endUtc > now) return { start: startUtc, end: endUtc };
    ahead += 7;
  }
  return null;
}

function relative(ms: number) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

export function initSchedule() {
  const roots = document.querySelectorAll<HTMLElement>("[data-schedule]");
  if (!roots.length) return;
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  const zoneFmt = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" });
  const zoneName = zoneFmt.formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";

  roots.forEach((root) => {
    const tz = root.dataset.schedule || "Africa/Johannesburg";
    const upcoming: { start: number; end: number; title: string }[] = [];

    root.querySelectorAll<HTMLElement>("[data-slot]").forEach((slot) => {
      const occ = nextOccurrence(slot.dataset.day || "", slot.dataset.start || "", Number(slot.dataset.duration || 120), tz);
      if (!occ) return;
      upcoming.push({ ...occ, title: slot.dataset.title || "" });
      const dayEl = slot.querySelector("[data-slot-day]");
      const timeEl = slot.querySelector("[data-slot-time]");
      if (dayEl) dayEl.textContent = dayFmt.format(occ.start);
      if (timeEl) timeEl.textContent = `${timeFmt.format(occ.start)} – ${timeFmt.format(occ.end)} ${zoneName}`;
    });

    root.querySelectorAll("[data-local-zone]").forEach((el) => (el.textContent = zoneName));

    const next = upcoming.sort((a, b) => a.start - b.start)[0];
    const nextEl = root.querySelector<HTMLElement>("[data-next-stream]");
    if (next && nextEl) {
      const now = Date.now();
      nextEl.textContent =
        next.start <= now
          ? `Scheduled now: ${next.title}`
          : `Next stream ${relative(next.start - now)} · ${dayFmt.format(next.start)} ${timeFmt.format(next.start)}`;
      nextEl.hidden = false;
    }
  });
}

/* ---------------- copy buttons + email "decrypt" ---------------- */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function scramble(el: Element, text: string, onDone: () => void) {
  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*<>[]{}/\\";
  const total = Math.max(text.length * 2, 18);
  let frame = 0;
  const step = () => {
    const revealed = Math.floor((frame / total) * text.length);
    let out = "";
    for (let i = 0; i < text.length; i++) out += i < revealed ? text[i] : glyphs[Math.floor(Math.random() * glyphs.length)];
    el.textContent = out;
    if (++frame > total) {
      el.textContent = text;
      onDone();
    } else window.setTimeout(step, 28);
  };
  step();
}

export function initCopy() {
  document.querySelectorAll<HTMLElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const value = btn.dataset.copy || "";
      const label = btn.querySelector("[data-copy-label]");
      const display = btn.querySelector("[data-copy-display]");
      const isLink = btn.tagName === "A";
      if (isLink && btn.dataset.copied === "1") return; // second click: let the mailto open
      if (isLink) e.preventDefault();
      await copyText(value);
      const reset = label?.textContent ?? "";
      const done = () => {
        btn.classList.add("copied");
        btn.dataset.copied = "1";
        if (label) label.textContent = "Copied!";
        window.setTimeout(() => {
          btn.classList.remove("copied");
          if (label) label.textContent = reset;
        }, 1800);
      };
      if (display && !reduceMotion) scramble(display, value, done);
      else {
        if (display) display.textContent = value;
        done();
      }
    });
  });
}

/* ---------------- click-to-load video embeds ---------------- */

export function initVideoFacades() {
  document.querySelectorAll<HTMLButtonElement>("[data-embed]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const iframe = document.createElement("iframe");
      iframe.src = btn.dataset.embed!;
      iframe.title = btn.dataset.title || "Video";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      iframe.className = btn.dataset.frameClass || "embed-frame";
      btn.replaceWith(iframe);
    });
  });
}

/* ---------------- filter chips (guides & tips) ---------------- */

export function initFilters() {
  document.querySelectorAll<HTMLElement>("[data-filter-group]").forEach((group) => {
    const target = document.querySelector<HTMLElement>(group.dataset.filterGroup || "");
    if (!target) return;
    const chips = Array.from(group.querySelectorAll<HTMLButtonElement>("[data-filter]"));
    const items = Array.from(target.querySelectorAll<HTMLElement>("[data-kind]"));
    const empty = document.querySelector<HTMLElement>(group.dataset.filterEmpty || "");

    const select = (value: string, push: boolean) => {
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === value)));
      let shown = 0;
      items.forEach((item) => {
        const match = value === "all" || item.dataset.kind === value;
        item.hidden = !match;
        if (match) {
          shown++;
          item.classList.add("in-view");
        }
      });
      if (empty) empty.hidden = shown > 0;
      if (push) {
        const url = new URL(window.location.href);
        if (value === "all") url.searchParams.delete("type");
        else url.searchParams.set("type", value);
        history.replaceState(null, "", url);
      }
    };

    chips.forEach((chip) => chip.addEventListener("click", () => select(chip.dataset.filter || "all", true)));
    const initial = new URLSearchParams(window.location.search).get("type");
    if (initial && chips.some((c) => c.dataset.filter === initial)) select(initial, false);
  });
}
