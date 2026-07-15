"use client";

// Server-rendered `toLocaleString` would use the server's timezone, not
// the viewer's. useSyncExternalStore's server/client snapshot split is
// the supported way to read a client-only value (the browser's zone)
// without a server/client hydration mismatch: it renders the empty
// server snapshot on first paint, then swaps in the real one once
// mounted in the browser.
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

export function LocalTime({
  iso,
  dateOnly = false,
}: {
  iso: string;
  dateOnly?: boolean;
}) {
  const text = useSyncExternalStore(
    subscribe,
    () => {
      const d = new Date(iso);
      return dateOnly ? d.toLocaleDateString() : d.toLocaleString();
    },
    () => ""
  );

  return <span>{text}</span>;
}
