"use client";

import { useState, useTransition } from "react";
import { deleteSearch } from "./actions";
import { TrashIcon } from "./icons";

// Shared between the search detail header and each card on the
// homepage list — same control, same confirm copy, either place.
export function DeleteSearchButton({
  searchId,
  title,
  candidateCount,
}: {
  searchId: string;
  title: string;
  candidateCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const candidatePhrase =
    candidateCount > 0
      ? ` and its ${candidateCount} candidate${candidateCount === 1 ? "" : "s"} (with all their price and review history)`
      : "";

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      <button
        type="button"
        disabled={isPending}
        onClick={(e) => {
          // Guards against nesting inside a card-level <Link> on the
          // homepage — stray navigation would otherwise race the delete.
          e.preventDefault();
          e.stopPropagation();
          if (
            !window.confirm(
              `Delete "${title}"${candidatePhrase}? This can't be undone.`
            )
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            try {
              await deleteSearch(searchId);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded p-1 text-xs font-medium text-zinc-400 hover:text-red-600 disabled:opacity-50 dark:text-zinc-600 dark:hover:text-red-400"
      >
        <TrashIcon className="h-3.5 w-3.5" />
        Delete search
      </button>
    </div>
  );
}
