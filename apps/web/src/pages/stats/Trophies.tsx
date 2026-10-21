import { createElement, useEffect, useRef, useState } from "react";
import type React from "react";
import { Lock } from "lucide-react";
import { trophyShelf, type Achievement } from "@/lib/insights";
import { cn } from "@/lib/utils";
import { badgeIcon, byUnlockedNewest, MEDAL_STYLES, TIER_NAMES, unlockedOn } from "./badges";

/**
 * A badge's icon, as its own component.
 *
 * Picking the icon into a local and rendering `<Icon />` reads to React (and
 * the lint) as a component type created during render; going through
 * createElement on the module-level icon keeps the type stable.
 */
function BadgeIcon({ badge, className }: { badge: Achievement; className?: string }) {
  return createElement(badgeIcon(badge), { className });
}

const CONFETTI_COLORS = ["#fbbf24", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#22c55e"];

function spawnConfetti(container: HTMLElement) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    const angle = (i / count) * Math.PI * 2;
    const dist = 40 + Math.random() * 30;
    dot.style.cssText = `
      position: absolute; top: 50%; left: 50%;
      width: ${4 + Math.random() * 4}px;
      height: ${4 + Math.random() * 4}px;
      border-radius: ${Math.random() > 0.5 ? "50%" : "2px"};
      background: ${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};
      --cx: ${Math.cos(angle) * dist}px;
      --cy: ${Math.sin(angle) * dist - 20}px;
      animation: badge-confetti 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
      pointer-events: none; z-index: 50;
    `;
    container.appendChild(dot);
    setTimeout(() => dot.remove(), 650);
  }
}

function ProgressRing({ progress, size = 44 }: { progress: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  return (
    <svg width={size} height={size} className="absolute inset-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-border/30"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        className="text-white/60"
        style={{
          strokeDasharray: circ,
          strokeDashoffset: offset,
          "--ring-circumference": circ,
          "--ring-offset": offset,
          animation: "ring-fill 1s cubic-bezier(0.22, 1, 0.36, 1) forwards",
          transformOrigin: "center",
          transform: "rotate(-90deg)",
        } as React.CSSProperties}
      />
    </svg>
  );
}

function EarnedBadge({
  badge,
  unlocked,
  index,
  visible,
}: {
  badge: Achievement;
  unlocked: Record<string, string>;
  index: number;
  visible: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const when = unlockedOn(unlocked[badge.id]);
  const tierName = badge.tier ? TIER_NAMES[badge.tier] : null;

  const handleClick = () => {
    if (!flipped && ref.current) spawnConfetti(ref.current);
    setFlipped((f) => !f);
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      className="relative flex w-28 flex-col items-center text-center outline-none"
      style={{
        perspective: "600px",
        opacity: visible ? 1 : 0,
        animation: visible ? `badge-enter 500ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 60}ms both` : "none",
      }}
    >
      <div
        className="relative transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <span
          className={cn(
            "relative grid size-20 place-items-center rounded-full bg-gradient-to-br ring-4 transition-transform hover:-translate-y-1 hover:rotate-6 overflow-hidden",
            MEDAL_STYLES[badge.tier ?? 3],
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          <BadgeIcon badge={badge} className="size-8" />
          <span
            className="pointer-events-none absolute inset-y-0 w-[40%] bg-gradient-to-r from-transparent via-white/30 to-transparent"
            style={{
              animation: "medal-shine 4s ease-in-out infinite",
              animationDelay: `${index * 300}ms`,
            }}
          />
        </span>
        {/* Back */}
        <span
          className={cn(
            "absolute inset-0 grid size-20 place-items-center rounded-full bg-gradient-to-br ring-4",
            MEDAL_STYLES[badge.tier ?? 3],
          )}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <span className="flex flex-col items-center gap-0.5 px-2">
            {tierName && <span className="text-[10px] font-bold uppercase tracking-wider">{tierName}</span>}
            {when && <span className="text-[10px] opacity-80">{when}</span>}
            {!tierName && !when && <BadgeIcon badge={badge} className="size-6 opacity-60" />}
          </span>
        </span>
      </div>
      <span className="sensitive mt-3 text-sm font-semibold leading-tight">{badge.title}</span>
      <span className="mt-1 text-[11px] leading-snug text-muted-foreground">{badge.description}</span>
    </button>
  );
}

function LockedBadge({
  badge,
  index,
  visible,
}: {
  badge: Achievement;
  index: number;
  visible: boolean;
}) {
  return (
    <li
      className="flex items-center gap-4 border-b border-border py-3"
      style={{
        opacity: visible ? 1 : 0,
        animation: visible ? `badge-enter 400ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 40}ms both` : "none",
      }}
    >
      <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
        {badge.progress > 0 ? <BadgeIcon badge={badge} className="size-4" /> : <Lock className="size-3.5" />}
        {badge.progress > 0 && <ProgressRing progress={badge.progress} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <span className="sensitive">{badge.title}</span>
          {badge.tier && (
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">Tier {badge.tier} of 3</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{badge.description}</p>
      </div>
      {badge.progressLabel && (
        <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{badge.progressLabel}</span>
      )}
    </li>
  );
}

export function Trophies({ list, unlocked }: { list: Achievement[]; unlocked: Record<string, string> }) {
  const earnedCount = list.filter((a) => a.earned).length;
  const shelf = trophyShelf(list);
  const earned = byUnlockedNewest(shelf.earned, unlocked);
  const locked = shelf.locked;

  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pct = list.length > 0 ? Math.round((earnedCount / list.length) * 100) : 0;

  return (
    <div ref={sectionRef} className="space-y-12">
      <div>
        <div className="mb-6 flex items-end gap-4">
          <p className="text-2xl font-bold tracking-tight">
            <span className="text-amber-300 tabular-nums">{earnedCount}</span> of {list.length} unlocked
          </p>
          <div className="mb-1 flex h-2 w-32 overflow-hidden rounded-full bg-secondary/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-1000 ease-out"
              style={{ width: visible ? `${pct}%` : "0%" }}
            />
          </div>
        </div>
        {earned.length === 0 ? (
          <p className="text-muted-foreground">None yet — your first one is an hour of watching away.</p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-8">
            {earned.map((badge, i) => (
              <EarnedBadge key={badge.id} badge={badge} unlocked={unlocked} index={i} visible={visible} />
            ))}
          </div>
        )}
      </div>

      {locked.length > 0 && (
        <div>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Still to unlock</p>
          <ul className="grid gap-x-10 gap-y-1 md:grid-cols-2">
            {locked.map((badge, i) => (
              <LockedBadge key={badge.id} badge={badge} index={i} visible={visible} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
