"use client";

import { useState, useTransition } from "react";
import { chooseCandidate, rejectCandidate, setCandidateStatus } from "./actions";
import { CANDIDATE_STATUS_STYLES } from "./format";
import type { CandidateStatus } from "./types";

// Status control for a non-rejected card. Moves between
// considering/shortlisted/chosen directly; picking "reject" swaps in
// a required-reason prompt instead of firing immediately.
export function CandidateStatusControls({
  searchId,
  candidateId,
  status,
}: {
  searchId: string;
  candidateId: string;
  status: CandidateStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (rejecting) {
    return (
      <form
        className="flex shrink-0 items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) {
            setError("A reason is required.");
            return;
          }
          run(async () => {
            await rejectCandidate(searchId, candidateId, reason);
            setRejecting(false);
            setReason("");
          });
        }}
      >
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejecting…"
          className="w-40 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => {
            setRejecting(false);
            setError(null);
          }}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </form>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <select
        value={status}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "rejected") {
            setRejecting(true);
            return;
          }
          if (next === "chosen") {
            run(() => chooseCandidate(searchId, candidateId));
            return;
          }
          run(() => setCandidateStatus(searchId, candidateId, next as "considering" | "shortlisted"));
        }}
        className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium capitalize disabled:opacity-50 ${CANDIDATE_STATUS_STYLES[status]}`}
      >
        <option value="considering">Considering</option>
        <option value="shortlisted">Shortlisted</option>
        <option value="chosen">Chosen</option>
        <option value="rejected">Reject…</option>
      </select>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
