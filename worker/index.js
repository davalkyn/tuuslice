// Cloudflare Worker for tuuslice.
// Static pages are served from ./dist by the assets binding. This script only
// handles /api/* (see run_worker_first in wrangler.jsonc).
//
// GET /api/live -> { configured, live, title, viewers }
//   Needs two secrets from a Kick developer app (https://kick.com/settings/developer):
//     npx wrangler secret put KICK_CLIENT_ID
//     npx wrangler secret put KICK_CLIENT_SECRET
//   Without them it returns { configured: false } and the site falls back to a
//   plain "Watch on Kick" button.

const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_CHANNELS_URL = "https://api.kick.com/public/v1/channels";
const DEFAULT_SLUG = "tuuslice";
const CACHE_SECONDS = 60;

let appToken = null; // { value, expiresAt }

function json(body, status = 200, maxAge = CACHE_SECONDS) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "access-control-allow-origin": "*",
    },
  });
}

async function getAppToken(env) {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value;
  const res = await fetch(KICK_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.KICK_CLIENT_ID,
      client_secret: env.KICK_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Kick token request failed: ${res.status}`);
  const data = await res.json();
  appToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return appToken.value;
}

async function liveStatus(request, env, ctx) {
  if (!env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET) {
    return json({ configured: false }, 200, 300);
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/live", request.url).toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const slug = env.KICK_SLUG || DEFAULT_SLUG;
    const token = await getAppToken(env);
    const res = await fetch(`${KICK_CHANNELS_URL}?slug=${encodeURIComponent(slug)}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    if (res.status === 401) appToken = null;
    if (!res.ok) throw new Error(`Kick channels request failed: ${res.status}`);
    const body = await res.json();
    const channel = body?.data?.[0];
    const stream = channel?.stream ?? {};
    const response = json({
      configured: true,
      live: Boolean(stream.is_live),
      title: stream.is_live ? channel?.stream_title ?? "" : "",
      viewers: stream.is_live && typeof stream.viewer_count === "number" ? stream.viewer_count : undefined,
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error(err);
    return json({ configured: true, live: false, error: true }, 200, 30);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/live") {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method not allowed" }, 405, 0);
      return liveStatus(request, env, ctx);
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404, 0);
    return env.ASSETS.fetch(request);
  },
};
