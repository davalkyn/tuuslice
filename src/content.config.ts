import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// The admin panel can save empty optional fields as "" or null; treat those as missing.
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);
const optionalText = z.preprocess(blank, z.string().optional());
const optionalDate = z.preprocess(blank, z.coerce.date().optional());
const list = <T extends z.ZodType>(item: T) => z.preprocess((v) => blank(v) ?? [], z.array(item));
const flag = z.preprocess((v) => blank(v) ?? false, z.boolean());

// Shared by every written post. Keep in sync with public/admin/config.yml.
const base = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: optionalDate,
  cover: optionalText,
  coverAlt: optionalText,
  tags: list(z.string()),
  featured: flag,
  draft: flag,
});

const platforms = list(z.enum(["ps5", "xbox-series-x", "xbox-series-s", "pc"]));

const news = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/news" }),
  schema: base.extend({
    status: z.preprocess((v) => blank(v) ?? "unconfirmed", z.enum(["verified", "rumor", "unconfirmed"])),
    sources: list(z.object({ name: z.string(), url: optionalText })),
  }),
});

const guideSchema = base.extend({
  platforms,
  gear: list(z.string()),
});

const guides = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/guides" }),
  schema: guideSchema,
});

const tips = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/tips" }),
  schema: guideSchema,
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: base,
});

const videos = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/videos" }),
  schema: z.object({
    title: z.string(),
    platform: z.enum(["youtube", "tiktok", "kick"]),
    url: z.string(),
    pubDate: z.coerce.date(),
    featured: flag,
    draft: flag,
  }),
});

export const collections = { news, guides, tips, blog, videos };
