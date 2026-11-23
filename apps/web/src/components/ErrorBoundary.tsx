// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

type FallbackProps = {
  error: Error;
  /** Clears the error and re-renders the subtree that threw. */
  reset: () => void;
};

type Props = {
  children: ReactNode;
  fallback: (props: FallbackProps) => ReactNode;
};

type State = { error: Error | null };

/**
 * Catches render errors so one broken component can't blank the whole app.
 *
 * A class because there is still no hook equivalent — `getDerivedStateFromError`
 * is the only way to catch a render error in React.
 *
 * Deliberately has no reset-on-navigation: this boundary sits outside the
 * router, so there is no navigation it could observe. Recovery is the
 * fallback's own buttons. Per-route errors are the router's job instead, and
 * it clears those itself on the next navigation.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The fallback deliberately hides the stack, so this is the only place it
    // survives. Kept on console rather than sent anywhere: this is a private
    // library and errors can name real file paths.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }
    return this.props.children;
  }
}

/**
 * What a caught error looks like.
 *
 * Says what broke, that the library itself is untouched, and how to get out.
 * The message is tucked into a collapsed `details` rather than printed: it is
 * needed when reporting a bug and noise the rest of the time.
 */
export function ErrorFallback({
  error,
  reset,
  title = "Something went wrong",
}: FallbackProps & { title?: string }) {
  return (
    <div
      role="alert"
      className="mx-auto my-16 max-w-lg rounded-lg border border-border bg-card p-6"
    >
      <div className="flex items-center gap-2.5">
        <TriangleAlert className="size-5 shrink-0 text-amber-500" />
        <h1 className="text-base font-semibold">{title}</h1>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        This part of the page failed to render. Your media files and library
        data are untouched — this is a display problem, and nothing was
        written.
      </p>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          <RotateCw className="size-3.5" />
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          Reload the page
        </button>
      </div>

      <details className="mt-5">
        <summary className="cursor-pointer text-xs text-muted-foreground/70 hover:text-muted-foreground">
          Technical details
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-secondary/60 p-3 text-[11px] text-muted-foreground">
          {error.message || String(error)}
        </pre>
      </details>
    </div>
  );
}
