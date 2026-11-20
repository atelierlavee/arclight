import type { MediaCardItem } from "@/components/MediaCard";
import { setPerformerFollowed } from "./performerApi";
import { setStudioFollowed } from "./studioApi";

export type FollowedPerformer = {
  id: number;
  name: string;
  hasImage: boolean;
  hasBanner: boolean;
  followedAt: string;
  videoCount: number;
  /** Unwatched videos that arrived within `days`. */
  newCount: number;
  latestAt: string | null;
  representativeItemId: number | null;
};

export type FollowedStudio = Omit<FollowedPerformer, "hasImage" | "hasBanner">;

export type Following = {
  performers: FollowedPerformer[];
  studios: FollowedStudio[];
  /** How far back "new" looks. */
  days: number;
};

/** The figures a suggestion is made from, all this profile's own. */
export type SuggestionFigures = {
  secondsWatched: number;
  plays: number;
  oCount: number;
  favouriteVideos: number;
  averageRating: number | null;
  videoCount: number;
  representativeItemId: number | null;
};

export type SuggestedPerformer = SuggestionFigures & {
  id: number;
  name: string;
  hasImage: boolean;
  hasBanner: boolean;
  isFavorite: boolean;
};

export type SuggestedStudio = SuggestionFigures & { id: number; name: string };

export type Suggestions = { performers: SuggestedPerformer[]; studios: SuggestedStudio[] };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** A video in the feed, and who it is there because of. */
export type FeedItem = MediaCardItem & {
  createdAt: string;
  lastPositionSeconds: number;
  /** This profile's private note on it, or null. */
  note: string | null;
  because: {
    performers: { id: number; name: string; hasImage: boolean; hasBanner: boolean }[];
    /** The nearest followed studio at or above the video's own. */
    studio: { id: number; name: string } | null;
  };
};

export type FeedPage = { items: FeedItem[]; page: number; hasMore: boolean };

/** What the feed shows: from everyone or one performer or studio, in which order. */
export type FeedFilter = {
  /** "added" is newest arrival first; the default is newest release first. */
  order: "released" | "added";
  performerId?: number;
  studioId?: number;
};

export async function fetchFeed(page: number, filter: FeedFilter): Promise<FeedPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (filter.order === "added") params.set("order", "added");
  if (filter.performerId !== undefined) params.set("performer", String(filter.performerId));
  if (filter.studioId !== undefined) params.set("studio", String(filter.studioId));
  return json<FeedPage>(await fetch(`/api/following/feed?${params}`));
}

export type Upcoming = {
  items: { id: number; title: string; thumbnailFile: string | null; createdAt: string }[];
  count: number;
};

/** What is still waiting in the inbox from who you follow. */
export async function fetchUpcoming(): Promise<Upcoming> {
  return json<Upcoming>(await fetch("/api/following/upcoming"));
}

export async function fetchFollowing(): Promise<Following> {
  return json<Following>(await fetch("/api/following"));
}

export async function fetchSuggestions(): Promise<Suggestions> {
  return json<Suggestions>(await fetch("/api/following/suggestions"));
}

export { setPerformerFollowed, setStudioFollowed };

/**
 * Why something is suggested, in a few words: the two or three strongest
 * figures, strongest first. "6 h watched · 3 counted · 4 favourites".
 */
export function suggestionReasons(figures: SuggestionFigures, isFavorite = false): string[] {
  const reasons: { weight: number; text: string }[] = [];
  const hours = figures.secondsWatched / 3600;
  if (hours >= 1) reasons.push({ weight: hours * 2, text: `${Math.round(hours)} h watched` });
  else if (figures.secondsWatched >= 60)
    reasons.push({ weight: hours * 2, text: `${Math.round(figures.secondsWatched / 60)} min watched` });
  if (figures.plays > 0)
    reasons.push({ weight: figures.plays, text: `${figures.plays} play${figures.plays === 1 ? "" : "s"}` });
  if (figures.oCount > 0) reasons.push({ weight: figures.oCount * 3, text: `${figures.oCount} counted` });
  if (figures.favouriteVideos > 0)
    reasons.push({
      weight: figures.favouriteVideos * 2,
      text: `${figures.favouriteVideos} favourite${figures.favouriteVideos === 1 ? "" : "s"}`,
    });
  if (figures.averageRating !== null)
    reasons.push({ weight: figures.averageRating, text: `${figures.averageRating}★ on average` });
  if (isFavorite) reasons.push({ weight: 5, text: "a favourite" });
  return reasons
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((reason) => reason.text);
}

/** "today", "3 days ago", "5 weeks ago" — how fresh the latest arrival is. */
export function arrivedAgo(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export type FollowingStatsEntry = {
  id: number;
  name: string;
  hasImage?: boolean;
  hasBanner?: boolean;
};

export type FollowingStats = {
  following: { performers: number; studios: number };
  share: { total: number; followed: number; recentTotal: number; recentFollowed: number };
  top: {
    performers: (FollowingStatsEntry & { seconds: number })[];
    studios: (FollowingStatsEntry & { seconds: number })[];
  };
  quiet: {
    performers: (FollowingStatsEntry & { followedAt: string; lastWatchedAt: string | null; videoCount: number })[];
    studios: (FollowingStatsEntry & { followedAt: string; lastWatchedAt: string | null; videoCount: number })[];
  };
  recentDays: number;
  quietDays: number;
};

export async function fetchFollowingStats(): Promise<FollowingStats> {
  return json<FollowingStats>(await fetch("/api/following/stats"));
}

/** A whole percentage of `part` in `whole`, or null when there is nothing to divide. */
export function sharePercent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export type FollowingTags = {
  tags: { id: number; name: string; count: number }[];
  /** False when nothing arrived in `days` and the counts cover everything. */
  recent: boolean;
  days: number;
};

export async function fetchFollowingTags(): Promise<FollowingTags> {
  return json<FollowingTags>(await fetch("/api/following/tags"));
}
