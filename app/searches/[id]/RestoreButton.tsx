"use client";

import { useState, useTransition } from "react";
import { restoreCandidate } from "./actions";

export function RestoreButton({
  searchId,
  candidateId,
}: {
  searchId: string;
  candidateId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await restoreCandidate(searchId, candidateId);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          });
        }}
        className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
      >
        Restore
      </button>
    </div>
  );
}
