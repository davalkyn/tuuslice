import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { SECTIONS, getAllPosts, postUrl } from "../lib/content";
import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

export async function GET(context: APIContext) {
  const posts = await getAllPosts();
  return rss({
    title: `${SITE_NAME}: GTA 6 news, guides & tips`,
    description: SITE_DESCRIPTION,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: postUrl(post),
      categories: [SECTIONS[post.collection].label, ...post.data.tags],
    })),
    customData: "<language>en</language>",
  });
}
