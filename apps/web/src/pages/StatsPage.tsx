import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { fetchAuthStatus } from "@/lib/authApi";
import {
  achievements,
  formatWatchTime,
  funFacts,
  hallOfFame,
  localDay,
  secondsByDay,
  streaks,
  type Insights,
} from "@/lib/insights";
import { fetchInsights } from "@/lib/insightsApi";
import { fetchAchievements } from "@/lib/achievementsApi";
import { Chapter } from "./stats/Chapter";
import { Habits } from "./stats/Habits";
import { MilestonesTimeline } from "./stats/MilestonesTimeline";
import { Opening } from "./stats/Opening";
import { Podium } from "./stats/Podium";
import { Records } from "./stats/Records";
import { libraryReach, totalSeconds } from "./stats/statsData";
import { Trophies } from "./stats/Trophies";
import { useHeadline } from "./stats/useHeadline";
import { YourYear } from "./stats/YourYear";
import { qk } from "@/lib/queryKeys";

/**
 * Your viewing as an editorial "year in review" rather than a dashboard:
 * a cinematic opening built from your #1 video, then four numbered
 * chapters — the podium, your year, your habits, your trophies — set in
 * big type with hairline rules instead of boxes.
 *
 * Everything here reads; nothing on this page writes. The watch log only
 * began when the page was added, so chapters appear as there is something
 * real to put in them.
 */
export function StatsPage() {
  return (
    // No shell title: the opening is the title.
    <AppShell>
      <StatsView />
    </AppShell>
  );
}

/** Your viewing, looked back on. */
function StatsView() {
  const { data, isLoading } = useQuery({ queryKey: qk.insights, queryFn: fetchInsights });
  const { data: auth } = useQuery({ queryKey: qk.authStatus, queryFn: fetchAuthStatus });
  const [open, setOpen] = useState<{ id: number; autoPlay: boolean; resume?: boolean } | null>(null);
  const openItem = (id: number) => setOpen({ id, autoPlay: false });
  const playItem = (id: number, resume = false) => setOpen({ id, autoPlay: true, resume });

  return (
    <>
      {isLoading && <p className="px-6 py-8 text-sm text-muted-foreground">Loading…</p>}
      {data && (
        <StatsStory data={data} name={auth?.user?.username ?? null} onOpenItem={openItem} onPlayItem={playItem} />
      )}
      {open && (
        <MediaDetailModal itemId={open.id} autoPlay={open.autoPlay} resume={open.resume} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function StatsStory({
  data,
  name,
  onOpenItem,
  onPlayItem,
}: {
  data: Insights;
  name: string | null;
  onOpenItem: (id: number) => void;
  onPlayItem: (id: number, resume?: boolean) => void;
}) {
  const today = localDay(new Date());
  const days = useMemo(() => secondsByDay(data.log), [data]);
  const streak = useMemo(() => streaks(days, today), [days, today]);
  const facts = useMemo(() => funFacts(data.log), [data]);
  const total = useMemo(() => totalSeconds(data.log), [data]);
  const hall = useMemo(() => hallOfFame(data), [data]);
  const headline = useHeadline(data, hall.mainEvent);
  const hasHistory = total >= 60;
  // Shared with the app-wide unlock watcher, which keeps it current.
  const { data: record } = useQuery({ queryKey: qk.achievements, queryFn: fetchAchievements, staleTime: Infinity });

  // An unlock toast's "View" lands here with #trophies; the chapter only
  // exists once the data has, so the browser's own jump would miss it.
  const hash = useRouterState({ select: (state) => state.location.hash });
  useEffect(() => {
    if (hash === "trophies") document.getElementById("trophies")?.scrollIntoView({ behavior: "smooth" });
  }, [hash]);

  const { performerCount, studioCount, activeDays } = libraryReach(data, days);

  return (
    <div className="pb-16">
      <Opening
        name={name}
        backdrop={headline?.item ?? null}
        total={total}
        videos={facts.videosWatched}
        performers={performerCount}
        studios={studioCount}
        figures={[
          { label: "Current streak", value: `${streak.current} ${streak.current === 1 ? "day" : "days"}` },
          { label: "Longest streak", value: `${streak.longest} ${streak.longest === 1 ? "day" : "days"}` },
          { label: "Active days", value: String(activeDays) },
          { label: "Average day", value: formatWatchTime(facts.averageDaySeconds) },
        ]}
        hasHistory={hasHistory}
      />

      <div className="mx-auto max-w-[1320px] px-4 md:px-8">
        <Chapter number="01" title="The podium" kicker="Hall of fame">
          <Podium data={data} hall={hall} headline={headline} onOpenItem={onOpenItem} onPlayItem={onPlayItem} />
        </Chapter>

        {/* Always shown — an empty calendar is a goal to fill, not a gap. */}
        <Chapter number="02" title="Your year" kicker="Month by month">
          <YourYear data={data} days={days} today={today} onOpenItem={onOpenItem} />
        </Chapter>

        {hasHistory && (
          <Chapter number="03" title="Your habits" kicker="When you watch">
            <Habits data={data} lateShare={facts.lateNightShare} />
          </Chapter>
        )}

        {hasHistory && (
          <Chapter number="04" title="Personal records" kicker="All-time bests">
            <Records data={data} onOpenItem={onOpenItem} />
          </Chapter>
        )}

        {hasHistory && (
          <Chapter number="05" title="Your journey" kicker="Library milestones">
            <MilestonesTimeline data={data} />
          </Chapter>
        )}

        <Chapter id="trophies" number={hasHistory ? "06" : "03"} title="Trophies" kicker="Achievements">
          <Trophies list={achievements(data, today)} unlocked={record?.unlocked ?? {}} />
        </Chapter>
      </div>
    </div>
  );
}
