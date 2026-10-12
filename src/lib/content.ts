import { getCollection, type CollectionEntry } from "astro:content";

export type PostCollection = "news" | "guides" | "tips" | "blog";
export type Post = CollectionEntry<PostCollection>;

export const SECTIONS: Record<
  PostCollection,
  { label: string; single: string; path: string; tone: "pink" | "orange" | "teal" | "sun" }
> = {
  news: { label: "News", single: "News", path: "/news", tone: "pink" },
  guides: { label: "Guides", single: "Guide", path: "/guides", tone: "orange" },
  tips: { label: "Tips & Tricks", single: "Tip", path: "/tips", tone: "teal" },
  blog: { label: "Blog", single: "Blog", path: "/blog", tone: "sun" },
};

const published = ({ data }: { data: { draft: boolean } }) => import.meta.env.DEV || !data.draft;

const newestFirst = (a: Post, b: Post) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

export async function getPosts(collection: PostCollection): Promise<Post[]> {
  const entries = (await getCollection(collection, published)) as Post[];
  return entries.sort(newestFirst);
}

export async function getAllPosts(collections: PostCollection[] = ["news", "guides", "tips", "blog"]) {
  const lists = await Promise.all(collections.map((c) => getPosts(c)));
  return lists.flat().sort(newestFirst);
}

export const postUrl = (post: Post) => `${SECTIONS[post.collection].path}/${post.id}/`;

export function readingMinutes(body: string | undefined) {
  const words = (body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export async function getVideos() {
  const entries = await getCollection("videos", published);
  return entries.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export type Video = CollectionEntry<"videos">;

/** Pull an embeddable id out of a YouTube / TikTok / Kick URL. */
export function parseVideo(url: string, platform: Video["data"]["platform"]) {
  try {
    const u = new URL(url);
    if (platform === "youtube") {
      let id = u.searchParams.get("v") ?? "";
      if (!id && u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
      if (!id) {
        const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/);
        if (m) id = m[1];
      }
      return id ? { id, short: u.pathname.includes("/shorts/") } : null;
    }
    if (platform === "tiktok") {
      const m = u.pathname.match(/\/video\/(\d+)/);
      return m ? { id: m[1], short: true } : null;
    }
    return { id: "", short: false };
  } catch {
    return null;
  }
}
