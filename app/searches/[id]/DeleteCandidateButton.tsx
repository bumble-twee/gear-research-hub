"use client";

import { useState, useTransition } from "react";
import { TrashIcon } from "../../icons";
import { deleteCandidate } from "./actions";

// Deliberately placed away from CandidateStatusControls elsewhere on
// the card — a quiet, separate control so it isn't a misclick target
// next to the status dropdown that gets used far more often.
export function DeleteCandidateButton({
  searchId,
  candidateId,
  label,
}: {
  searchId: string;
  candidateId: string;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      <button
        type="button"
        disabled={isPending}
        aria-label={`Delete ${label}`}
        title="Delete candidate"
        onClick={() => {
          if (
            !window.confirm(
              `Delete ${label}? This also removes its price and review history. This can't be undone.`
            )
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            try {
              await deleteCandidate(searchId, candidateId);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          });
        }}
        className="rounded p-1 text-zinc-300 hover:text-red-600 disabled:opacity-50 dark:text-zinc-600 dark:hover:text-red-400"
      >
        <TrashIcon />
      </button>
    </div>
  );
}
