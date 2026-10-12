// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// The public address of the site. Used for canonical URLs, the sitemap,
// the RSS feed and social share previews. Change this when you move to a
// custom domain (e.g. "https://tuuslice.com").
const SITE = "https://tuuslice.workers.dev";

export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  integrations: [sitemap({ filter: (page) => !page.includes("/admin") })],
});
