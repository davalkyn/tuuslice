import type { APIContext } from "astro";

// Built from the site address in astro.config.mjs, so it can never point at the wrong host.
export function GET({ site }: APIContext) {
  const sitemap = new URL("/sitemap-index.xml", site).toString();
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${sitemap}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
