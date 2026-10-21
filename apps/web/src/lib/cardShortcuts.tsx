import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PeekPanel } from "@/components/PeekPanel";
import {
  isTypingTarget,
  openDetails,
  openSearch,
  playItem,
} from "./appEvents";
import { setWatched, updateItem, type MediaItemDetail } from "./mediaItemApi";
import { useQueue } from "./queue";
import { recordRecent } from "./recent";
import { useToast } from "./toast";
import { useUndoable } from "./undo";

/**
 * The card the keyboard is pointing at, and what the single-key shortcuts do
 * to it (§24).
 *
 * One listener for the whole app rather than one per surface. The first
 * version of this lived in MediaGrid, which meant the shortcuts worked on the
 * browse page and nowhere else — not on the home page, not on a performer's
 * rows, not in Related items. Since MediaCard is what every one of those
 * surfaces renders, having the *card* report engagement is what makes the
 * shortcuts a property of a card rather than of whichever container happened
 * to implement them.
 *
 * "Engaged" means hovered or focused, and it is the card's own business to
 * say so — see MediaCard. Focus wins over hover where both apply, so a
 * keyboard user walking a grid is never hijacked by wherever the pointer
 * happens to be resting.
 */

export type EngagedCard = {
  id: number;
  title: string;
  itemType: "video" | "photo" | "folder";
  thumbnailFile?: string | null;
  durationSeconds?: number | null;
};

type Engagement = { card: EngagedCard; via: "focus" | "hover" };

type CardShortcutStore = {
  /** The card the shortcuts would act on, or null. */
  engaged: EngagedCard | null;
  /** Called by MediaCard as the pointer or focus arrives and leaves. */
  setEngagement: (
    card: EngagedCard,
    via: "focus" | "hover",
    engaged: boolean,
  ) => void;
  /** The actions, exposed so context menus run the same code as the keys. */
  peek: (card: EngagedCard) => void;
  toggleFavourite: (card: EngagedCard) => void;
  toggleWatched: (card: EngagedCard) => void;
};

const CardShortcutContext = createContext<CardShortcutStore | null>(null);

/**
 * Whether something is open on top of the page.
 *
 * Asked of the DOM rather than tracked, because the overlays are owned by
 * half a dozen different components and a registry would be one more thing
 * for a new overlay to forget to join. Every one of them already announces
 * itself to assistive technology, so the same markup answers this — and an
 * overlay that did not would have a worse problem than this one.
 *
 * The peek panel counts: with it open, Space belongs to whatever is focused
 * inside it rather than to the grid behind.
 */
function overlayIsOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"], [role="menu"]'));
}

export function CardShortcutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [engagement, setEngagementState] = useState<Engagement | null>(null);
  const [peekId, setPeekId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { add } = useQueue();
  const runUndoable = useUndoable();
  const { toast } = useToast();

  // Mirrors the state for the listener, so the effect below can bind once
  // rather than re-binding on every hover.
  const engagementRef = useRef<Engagement | null>(null);
  engagementRef.current = engagement;

  const setEngagement = useCallback(
    (card: EngagedCard, via: "focus" | "hover", engaged: boolean) => {
      setEngagementState((current) => {
        if (engaged) {
          // Focus outranks hover: a card under the pointer must not steal the
          // target from the one the keyboard is actually on.
          if (current?.via === "focus" && via === "hover") return current;
          return { card, via };
        }
        // Only the card that holds it may release it. Without this, leaving
        // card A after having already entered card B — which is the ordinary
        // order of events when sweeping across a row — would clear B.
        if (current?.card.id !== card.id) return current;
        // Losing hover while still focused leaves the focus engagement in
        // place rather than dropping the target entirely.
        if (current.via === "focus" && via === "hover") return current;
        return null;
      });
    },
    [],
  );

  function refresh(id: number) {
    queryClient.invalidateQueries({ queryKey: ["media-item", id] });
    queryClient.invalidateQueries({ queryKey: ["media-items"] });
    queryClient.invalidateQueries({ queryKey: ["continue-watching"] });
  }

  /**
   * Favourite and watched, read-then-write.
   *
   * A card does not carry either flag — the grid's list response has no room
   * for state that only the detail view shows — so both read the item first
   * rather than assuming. That read is also what gives the inverse something
   * true to restore: toggling from a guess sets the opposite of what the
   * toast just said, on the second press.
   */
  const toggleFavourite = useCallback(
    (card: EngagedCard) => {
      void runUndoable({
        message: (wasFavourite) =>
          wasFavourite ? "Removed from Favourites" : "Added to Favourites",
        description: card.title,
        apply: async () => {
          const res = await fetch(`/api/media-items/${card.id}`);
          if (!res.ok) throw new Error("Could not read that item");
          const { isFavorite } = (await res.json()) as MediaItemDetail;
          await updateItem(card.id, { isFavorite: !isFavorite });
          // Only once the direction is known: un-favouriting something is
          // not "recently favourited", and recording it up front put every
          // removal into that row.
          if (!isFavorite) recordRecent("favourited", card);
          return isFavorite;
        },
        revert: (was) => updateItem(card.id, { isFavorite: was }),
        onSettled: () => refresh(card.id),
      });
    },
    // `refresh` closes over queryClient, which is stable for the app's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runUndoable],
  );

  const toggleWatched = useCallback(
    (card: EngagedCard) => {
      void runUndoable({
        message: (wasWatched) =>
          wasWatched ? "Marked unwatched" : "Marked watched",
        description: card.title,
        apply: async () => {
          const res = await fetch(`/api/media-items/${card.id}`);
          if (!res.ok) throw new Error("Could not read that item");
          const { watched } = (await res.json()) as MediaItemDetail;
          await setWatched(card.id, !watched);
          return watched;
        },
        revert: (was) => setWatched(card.id, was),
        onSettled: () => refresh(card.id),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runUndoable],
  );

  /**
   * 1–5 sets the stars, 0 clears them. Undoable like the flags above, and
   * read first for the same reason: the undo needs the rating that was
   * really there, not a guess from the tile.
   */
  const rate = useCallback(
    (card: EngagedCard, stars: number | null) => {
      void runUndoable({
        message: () => (stars ? `Rated ${stars} star${stars === 1 ? "" : "s"}` : "Rating cleared"),
        description: card.title,
        apply: async () => {
          const res = await fetch(`/api/media-items/${card.id}`);
          if (!res.ok) throw new Error("Could not read that item");
          const { rating } = (await res.json()) as MediaItemDetail;
          await updateItem(card.id, { rating: stars });
          return rating;
        },
        revert: (was) => updateItem(card.id, { rating: was }),
        onSettled: () => refresh(card.id),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runUndoable],
  );

  const peek = useCallback((card: EngagedCard) => {
    if (card.itemType === "folder") return;
    recordRecent("browsed", card);
    setPeekId(card.id);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Modified keys belong to the browser and to the app's own chorded
      // shortcuts; a bare letter is the only thing claimed here.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      // Something is covering the page and owns these keys — the player, the
      // peek panel, a menu, the palette, the photo viewer.
      if (overlayIsOpen()) return;

      const card = engagementRef.current?.card;
      if (!card) return;

      const isVideo = card.itemType === "video";
      const isFolder = card.itemType === "folder";

      switch (event.key) {
        case " ":
          // Space scrolls the page by default, and a card is a <button>, so
          // it would also fire the click already bound to opening the item.
          // preventDefault is what stops both.
          event.preventDefault();
          peek(card);
          break;
        case "p":
          if (!isVideo) return;
          event.preventDefault();
          recordRecent("played", card);
          playItem(card.id);
          break;
        case "f":
          if (isFolder) return;
          event.preventDefault();
          toggleFavourite(card);
          break;
        case "w":
          if (!isVideo) return;
          event.preventDefault();
          toggleWatched(card);
          break;
        case "e":
          if (isFolder) return;
          event.preventDefault();
          openDetails(card.id);
          break;
        case "q":
          if (!isVideo) return;
          event.preventDefault();
          add({
            id: card.id,
            title: card.title,
            thumbnailFile: card.thumbnailFile,
            durationSeconds: card.durationSeconds,
          });
          // The queue lives inside the player, so adding to it from a grid
          // otherwise changes nothing you can see — the one shortcut here
          // with no visible result at all.
          toast({
            title: "Added to queue",
            description: card.title,
            variant: "success",
          });
          break;
        case "/":
          event.preventDefault();
          openSearch();
          break;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
          if (isFolder) return;
          event.preventDefault();
          rate(card, event.key === "0" ? null : Number(event.key));
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [add, peek, rate, toast, toggleFavourite, toggleWatched]);

  const store = useMemo<CardShortcutStore>(
    () => ({
      engaged: engagement?.card ?? null,
      setEngagement,
      peek,
      toggleFavourite,
      toggleWatched,
    }),
    [engagement, setEngagement, peek, toggleFavourite, toggleWatched],
  );

  return (
    <CardShortcutContext.Provider value={store}>
      {children}
      {peekId !== null && (
        <PeekPanel
          itemId={peekId}
          onClose={() => setPeekId(null)}
          onPlay={(id, { resume }) => {
            setPeekId(null);
            playItem(id, { resume });
          }}
        />
      )}
    </CardShortcutContext.Provider>
  );
}

/**
 * For surfaces that want to run the same actions from a menu or a button.
 *
 * Returns no-ops outside the provider, so a card rendered in a test or a
 * picker still works rather than throwing.
 */
export function useCardShortcuts(): CardShortcutStore {
  return (
    useContext(CardShortcutContext) ?? {
      engaged: null,
      setEngagement: () => {},
      peek: () => {},
      toggleFavourite: () => {},
      toggleWatched: () => {},
    }
  );
}
