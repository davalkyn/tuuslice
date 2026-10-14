import settings from "../data/settings.json";

export { settings };

export const SITE_NAME = settings.brand;
export const SITE_DESCRIPTION =
  "tuuslice: GTA 6 news, guides, tips and live streams on Kick. A fan-made community hub for the road to Leonida.";

export const NAV = [
  { href: "/news/", label: "News" },
  { href: "/guides/", label: "Guides & Tips" },
  { href: "/series-s/", label: "Series S" },
  { href: "/videos/", label: "Videos" },
  { href: "/live/", label: "Live" },
  { href: "/blog/", label: "Blog" },
  { href: "/community/", label: "Community" },
] as const;

export const SOCIALS = [
  { key: "kick", label: "Kick", href: settings.socials.kick, handle: `kick.com/${settings.kickSlug}` },
  { key: "discord", label: "Discord", href: settings.socials.discord, handle: "Join the server" },
  { key: "telegram", label: "Telegram", href: settings.socials.telegram, handle: "News channel" },
  { key: "youtube", label: "YouTube", href: settings.socials.youtube, handle: "@tuuslice" },
  { key: "tiktok", label: "TikTok", href: settings.socials.tiktok, handle: "@tuuslice" },
  { key: "x", label: "X", href: settings.socials.x, handle: "@tuuslice" },
] as const;

export const kickChatUrl = `https://kick.com/popout/${settings.kickSlug}/chat`;
export const kickPlayerUrl = `https://player.kick.com/${settings.kickSlug}`;

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);

export const isoDate = (date: Date) => date.toISOString();

export const formatNumber = (n: number) =>
  new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard" }).format(n);
