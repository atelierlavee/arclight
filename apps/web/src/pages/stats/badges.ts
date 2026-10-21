import {
  Award,
  Bookmark,
  Cake,
  CalendarCheck,
  CalendarDays,
  Clock,
  Coffee,
  Compass,
  Film,
  Flame,
  Hourglass,
  Medal,
  Moon,
  Repeat,
  RotateCcw,
  Sparkles,
  Star,
  Sunrise,
  ThumbsDown,
  Timer,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Achievement } from "@/lib/insights";

const BADGE_ICONS: Record<string, LucideIcon> = {
  "night-owl": Moon,
  "early-bird": Sunrise,
  "lunch-break": Coffee,
  rewatcher: Repeat,
  binge: Zap,
  "weekend-warrior": CalendarDays,
  "full-week": CalendarCheck,
  "hat-trick": Sparkles,
  "short-and-sweet": Timer,
  tastemaker: Award,
  anniversary: Cake,
  "long-haul": Hourglass,
  "tough-crowd": ThumbsDown,
  comeback: RotateCcw,
};

const FAMILY_ICONS: Record<string, LucideIcon> = {
  "watch-time": Clock,
  marathon: Clock,
  streak: Flame,
  critic: Star,
  explorer: Compass,
  people: Users,
  moments: Bookmark,
  videos: Film,
  "active-days": CalendarCheck,
};

export function badgeIcon(badge: Achievement): LucideIcon {
  if (badge.family) return FAMILY_ICONS[badge.family] ?? Trophy;
  if (badge.id.includes("complete")) return Medal;
  return BADGE_ICONS[badge.id] ?? Trophy;
}

export const TIER_NAMES = { 1: "Bronze", 2: "Silver", 3: "Gold" } as const;

// Single badges keep the gold they always had; tiers step up to it.
export const MEDAL_STYLES = {
  1: "from-orange-300 via-orange-700 to-amber-950 text-orange-50 shadow-[0_8px_30px_-8px_rgba(194,65,12,0.5)] ring-orange-700/25",
  2: "from-slate-50 via-slate-300 to-slate-500 text-slate-900 shadow-[0_8px_30px_-8px_rgba(203,213,225,0.5)] ring-slate-200/20",
  3: "from-amber-200 via-amber-400 to-amber-700 text-amber-950 shadow-[0_8px_30px_-8px_rgba(245,158,11,0.6)] ring-amber-300/20",
} as const;

export function unlockedOn(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Earned badges, most recently unlocked first; any without a recorded date sort ahead of them all. */
export function byUnlockedNewest(earned: Achievement[], unlocked: Record<string, string>): Achievement[] {
  return [...earned].sort(
    (a, b) => (unlocked[b.id] ?? "\uffff").localeCompare(unlocked[a.id] ?? "\uffff"),
  );
}
