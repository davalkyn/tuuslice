interface LiveStatus {
  configured: boolean;
  live?: boolean;
  title?: string;
  viewers?: number;
}

const CACHE_KEY = "tuus-live";
const MAX_AGE = 60_000;

function apply(status: LiveStatus) {
  const live = Boolean(status.configured && status.live);
  document.querySelectorAll<HTMLElement>("[data-live-badge]").forEach((badge) => {
    badge.classList.toggle("is-live", live);
    const label = badge.querySelector("[data-live-label]");
    if (label) label.textContent = live ? "Live now" : "Watch on Kick";
    const viewers = badge.querySelector<HTMLElement>("[data-live-viewers]");
    if (viewers) {
      const show = live && typeof status.viewers === "number";
      viewers.hidden = !show;
      viewers.textContent = show ? `${status.viewers} watching` : "";
    }
  });
  document.querySelectorAll<HTMLElement>("[data-live-show]").forEach((el) => (el.hidden = !live));
  document.querySelectorAll<HTMLElement>("[data-live-hide]").forEach((el) => (el.hidden = live));
  document.querySelectorAll<HTMLElement>("[data-live-title]").forEach((el) => (el.textContent = status.title ?? ""));
}

function readCache(): { at: number; status: LiveStatus } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchStatus() {
  try {
    const res = await fetch("/api/live", { headers: { accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return;
    const status = (await res.json()) as LiveStatus;
    apply(status);
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), status }));
    } catch {
      /* storage unavailable */
    }
  } catch {
    /* offline or endpoint missing: keep the default "Watch on Kick" state */
  }
}

export function initLive() {
  if (!document.querySelector("[data-live-badge], [data-live-show], [data-live-hide]")) return;
  const cached = readCache();
  if (cached) apply(cached.status);
  if (!cached || Date.now() - cached.at > MAX_AGE) fetchStatus();
  window.setInterval(() => {
    if (!document.hidden) fetchStatus();
  }, 120_000);
}
