// @ts-check
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// The public address of the site. Canonical URLs, the sitemap, robots.txt, RSS
// and share previews are all built from it. Set SITE_URL in Cloudflare's build
// settings, or change the fallback here (e.g. "https://tuuslice.com").
const SITE = (process.env.SITE_URL || "https://tuuslice.workers.dev").replace(/\/+$/, "");

// Last-modified dates for the sitemap, read from each post's frontmatter.
const SECTION_PATHS = { news: "news", guides: "guides", tips: "tips", blog: "blog" };
const lastmod = new Map();
for (const [folder, path] of Object.entries(SECTION_PATHS)) {
  const dir = join("src/content", folder);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(join(dir, file), "utf8");
    const date = (text.match(/^updatedDate:\s*(\S+)/m) || text.match(/^pubDate:\s*(\S+)/m) || [])[1];
    if (date) lastmod.set(`/${path}/${file.replace(/\.md$/, "")}/`, new Date(date).toISOString());
  }
}
const newest = [...lastmod.values()].sort().pop();

export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/admin"),
      serialize(item) {
        const path = new URL(item.url).pathname;
        const date = lastmod.get(path);
        if (date) return { ...item, lastmod: date, changefreq: "weekly", priority: 0.7 };
        if (path === "/") return { ...item, lastmod: newest, changefreq: "daily", priority: 1.0 };
        if (/^\/(news|guides|tips|blog)\/$/.test(path)) return { ...item, lastmod: newest, changefreq: "daily", priority: 0.8 };
        return { ...item, changefreq: "weekly", priority: 0.6 };
      },
    }),
  ],
});
