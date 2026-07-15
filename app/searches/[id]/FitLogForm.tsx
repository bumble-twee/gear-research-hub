"use client";

import { useState, useTransition } from "react";
import { logFit } from "./actions";

// Local YYYY-MM-DD for the date input's default — deliberately the
// browser's local calendar date, not UTC, so "today" matches what the
// person logging fit actually sees on their clock.
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function FitLogForm({
  searchId,
  candidateId,
  initialRating,
  initialNotes,
}: {
  searchId: string;
  candidateId: string;
  initialRating: number | null;
  initialNotes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(initialRating ?? 0);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [date, setDate] = useState(todayLocal);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        Log fit
      </button>
    );
  }

  return (
    <form
      className="mt-2 flex flex-col items-start gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating < 1) {
          setError("Pick a fit rating.");
          return;
        }
        setError(null);
        startTransition(async () => {
          try {
            await logFit(searchId, candidateId, rating, notes.trim() || null, date);
            setOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
      }}
    >
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => {
          const value = i + 1;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`Fit rating ${value} of 5`}
              className={`h-4 w-4 rounded-full ${
                value <= rating
                  ? "bg-zinc-700 dark:bg-zinc-300"
                  : "border border-zinc-300 dark:border-zinc-600"
              }`}
            />
          );
        })}
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </form>
  );
}
