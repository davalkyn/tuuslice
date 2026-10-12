# tuuslice: GTA 6 hub

Fan-made GTA 6 community site: news, guides, tips and tricks, blog, videos, the Kick live stream and a Series S performance tracker. Built with [Astro](https://astro.build), edited with [Sveltia CMS](https://sveltiacms.app) at `/admin`, and served by Cloudflare Workers.

## Posting (every day)

1. Go to `https://<your-site>/admin/` and choose **Sign In Using Access Token**.
   - Create the token at GitHub → Settings → Developer settings → **Fine-grained tokens**.
   - Repository access: only `davalkyn/tuuslice`.
   - Permissions: **Contents: Read and write**.
2. Pick **News**, **Guides**, **Tips & Tricks**, **Blog** or **Videos** and click **New**.
3. Write the post and hit **Publish**. That commits to `master`, and Cloudflare rebuilds the site in about 2 minutes.

Tips:

- **News:** write a short summary in your own words, add the source link, and set the status (verified / rumor / unconfirmed).
- **Guides and tips:** pick gear items to add an affiliate box.
- **Videos:** paste a YouTube or TikTok link and it plays right on the site.
- **Site data:**
  - **Settings & links:** Discord invite, socials, audience numbers for sponsors, optional AdSense / analytics IDs
  - **Stream schedule:** times are converted to each visitor's time zone
  - **Gear & affiliate links**
  - **Series S tracker**

## Cloudflare settings (one time)

Workers & Pages → `tuuslice` → Settings → Build:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy` (default)

Optional LIVE badge, which needs a Kick developer app:

```sh
npx wrangler secret put KICK_CLIENT_ID
npx wrangler secret put KICK_CLIENT_SECRET
```

Without these secrets, `/api/live` returns `{"configured":false}` and the site shows a plain "Watch on Kick" button.

When you move to a custom domain, update `SITE` in `astro.config.mjs`, `site_url` in `public/admin/config.yml` and the sitemap line in `public/robots.txt`.

## Local development

```sh
npm install
npm run dev       # http://localhost:4321
npm run check     # type check
npm run preview   # build + run the Worker locally (wrangler dev)
```

## Layout

| Path | What |
| --- | --- |
| `src/content/{news,guides,tips,blog,videos}` | Posts (Markdown), edited via `/admin` |
| `src/data/*.json` | Settings, schedule, gear, Series S tracker |
| `src/content.config.ts` | Post schemas (keep in sync with `public/admin/config.yml`) |
| `src/components`, `src/layouts`, `src/pages` | Site UI |
| `src/scripts` | Animations, cursor, hover glow, countdown, live badge |
| `worker/index.js` | `/api/live` (Kick live status) |
| `public/admin` | CMS |

Fan-made. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive.
