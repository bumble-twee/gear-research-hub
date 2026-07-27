"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// `export const dynamic = "force-dynamic"` on this route only
// guarantees the *server* renders fresh data when asked — it doesn't
// stop Next's client-side Router Cache from serving an older cached
// RSC payload for this page on back/forward navigation (a separate
// cache, explicitly exempt from the `staleTimes` config, kept around
// to preserve scroll position). Force a real refetch every time this
// page mounts (covers arriving via the back button or any link), and
// again if the tab regains focus after being backgrounded.
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();

    function handleFocus() {
      router.refresh();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [router]);

  return null;
}
