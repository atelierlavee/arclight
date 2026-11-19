import { AppShell } from "@/components/AppShell";
import { APPEARANCE_SHORTCUT, DISCREET_SHORTCUT, SEARCH_SHORTCUT } from "@/lib/appearance";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-sans text-[11px] font-medium text-foreground/90">
      {children}
    </kbd>
  );
}

/** One shortcut: the keys, then what they do. */
function Row({ keys, children }: { keys: string[]; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <div className="flex w-40 shrink-0 flex-wrap items-center gap-1">
        {keys.map((key, index) => (
          <span key={key} className="flex items-center gap-1">
            {/* "or" rather than a slash: ← / → already uses one to mean
                "either key", and two meanings for one separator is worse than
                a word. */}
            {index > 0 && <span className="text-[10px] text-muted-foreground/50">or</span>}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </div>
      <span className="text-sm text-muted-foreground">{children}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h2>
      <div className="divide-y divide-border/50">{children}</div>
    </section>
  );
}

/**
 * Every keyboard shortcut in the app, in one place.
 *
 * Worth a page of its own because two of them have no button at all — the
 * appearance panel lost its header icon, and discreet mode is meant to be
 * reachable without looking. A shortcut nobody can find is the same as no
 * shortcut.
 */
export function HelpPage() {
  return (
    <AppShell title="Keyboard shortcuts" subtitle="Everything the keyboard does in this app.">
      <div className="max-w-2xl space-y-8 px-4 py-6 md:px-6">
        <Group title="Anywhere">
          <Row keys={[DISCREET_SHORTCUT]}>
            Discreet mode on or off — blurs every image immediately. Turning it on is instant;
            turning it off asks for your privacy password, if you've set one.
          </Row>
          <Row keys={[SEARCH_SHORTCUT]}>
            Search from anywhere — performers, studios and titles, with results as you type.
            Arrow keys move through them, Enter opens the highlighted one.
          </Row>
          <Row keys={[APPEARANCE_SHORTCUT]}>
            Open the appearance panel — tile size, labels, banner height and discreet settings.
            Press it again to close.
          </Row>
          <Row keys={["Esc"]}>
            Close whatever is open — the appearance panel, a video, the photo viewer, a menu.
            Layer by layer, innermost first.
          </Row>
        </Group>

        <Group title="In a grid of items">
          <Row keys={["J", "→"]}>Next item. The arrows move by row; J and K move one at a time.</Row>
          <Row keys={["K", "←"]}>Previous item.</Row>
          <Row keys={["↑", "↓"]}>Up or down a row.</Row>
          <Row keys={["Enter"]}>Open it.</Row>
          <Row keys={["Space"]}>
            Peek — details beside the grid, without leaving the page or losing
            your place in it.
          </Row>
          <Row keys={["P"]}>Play it.</Row>
          <Row keys={["F"]}>Favourite or unfavourite. The toast offers an undo.</Row>
          <Row keys={["1–5"]}>Rate it that many stars. <Kbd>0</Kbd> clears the rating.</Row>
          <Row keys={["W"]}>Mark watched or unwatched.</Row>
          <Row keys={["E"]}>Edit — opens the full details.</Row>
          <Row keys={["Q"]}>Add it to the queue.</Row>
          <Row keys={["C"]}>Its menu — the same one right-click opens.</Row>
          <Row keys={["R"]}>Open something at random from what's on screen.</Row>
          <Row keys={["/"]}>Search.</Row>
          <Row keys={["⌘A", "Ctrl A"]}>Select everything in the grid.</Row>
          <Row keys={["Esc"]}>Leave selection mode.</Row>
        </Group>

        <Group title="Selecting several items">
          <Row keys={["⌘click", "Ctrl click"]}>
            Add one item to the selection, or take it out. Starts a selection
            if none is running.
          </Row>
          <Row keys={["⇧click"]}>
            Everything between the last item you clicked and this one.
          </Row>
        </Group>

        <Group title="Playing a video">
          <Row keys={["Space", "K"]}>Play or pause.</Row>
          <Row keys={["←", "→"]}>Skip back or forward 10 seconds.</Row>
          <Row keys={["0–9"]}>Jump to that tenth of the video: 5 is halfway, 0 is the start.</Row>
          <Row keys={["↑", "↓"]}>Volume up or down. It's remembered for next time.</Row>
          <Row keys={["M"]}>Mute or unmute.</Row>
          <Row keys={["F"]}>Fullscreen.</Row>
          <Row keys={["I"]}>
            Picture in picture — the video pops out into its own small window
            and keeps playing over other applications.
          </Row>
          {/* Was missing, on a page whose whole point is that every shortcut
              is listed somewhere findable. */}
          <Row keys={["C"]}>
            Cinema mode — the video fills the window, everything else goes.
          </Row>
          <Row keys={["Q"]}>
            Show or hide the queue beside the player, whatever is in it.
          </Row>
          <Row keys={["S"]}>
            Subtitles: off, then each subtitle file beside the video in turn.
            The button only appears when the video has one.
          </Row>
          <Row keys={["O"]}>
            Count one on the video that's playing. A toast offers an undo.
          </Row>
          <Row keys={["G"]}>
            Contact sheet — the whole video as a grid of frames. Click one to
            play from there; G or Esc closes it.
          </Row>
          <Row keys={["Esc"]}>Close the video. Your position is saved.</Row>
        </Group>

        <Group title="Looking at photos">
          <Row keys={["←", "→"]}>Previous or next photo.</Row>
          <Row keys={["+", "-"]}>Zoom in or out. The scroll wheel does it too.</Row>
          <Row keys={["0"]}>Back to fitting the screen.</Row>
          <Row keys={["Space"]}>
            Start or stop the slideshow. The button beside it sets the seconds per
            photo; an album's Slideshow button starts it fullscreen.
          </Row>
          <Row keys={["F"]}>Fullscreen.</Row>
          <Row keys={["T"]}>Show or hide the thumbnail strip.</Row>
          <Row keys={["Esc"]}>
            Zoom out if you are zoomed in, otherwise close the viewer — one
            press, one layer.
          </Row>
        </Group>

        <Group title="Search">
          <Row keys={["↑", "↓"]}>Move through the suggestions.</Row>
          <Row keys={["Enter"]}>Open the highlighted result.</Row>
          <Row keys={["Esc"]}>Dismiss the suggestions.</Row>
        </Group>

        <Group title="Editing a title or tag">
          <Row keys={["Enter"]}>Save and finish.</Row>
          <Row keys={["Esc"]}>Cancel, leaving the original.</Row>
        </Group>

        <p className="max-w-prose border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground/70">
          Single-key shortcuts are ignored while you're typing in a text field, so a space in a
          title stays a space rather than pausing a video. The two combinations under “Anywhere”
          work regardless — the moment you need discreet mode isn't the moment to discover the
          cursor was in the search box.
        </p>
      </div>
    </AppShell>
  );
}
