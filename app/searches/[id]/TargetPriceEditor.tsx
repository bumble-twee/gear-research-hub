"use client";

import { useState, useTransition } from "react";
import { setTargetPrice } from "./actions";
import { formatPrice } from "./format";

// Optional user-set budget. Feeds computePriceStats' "Good deal"
// signal (format.ts) — current price at/below this counts as a good
// deal even when it isn't the lowest ever seen.
export function TargetPriceEditor({
  searchId,
  candidateId,
  targetPrice,
  currency,
}: {
  searchId: string;
  candidateId: string;
  targetPrice: number | null;
  currency: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(targetPrice !== null ? String(targetPrice) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const trimmed = value.trim();
    let parsed: number | null = null;
    if (trimmed) {
      parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Enter a positive number.");
        return;
      }
    }
    startTransition(async () => {
      try {
        await setTargetPrice(searchId, candidateId, parsed);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {targetPrice !== null ? (
          <span className="text-zinc-500 dark:text-zinc-400">
            Target: {formatPrice(targetPrice, currency)}
          </span>
        ) : (
          <span className="text-zinc-400 dark:text-zinc-500">No target price set</span>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(targetPrice !== null ? String(targetPrice) : "");
            setEditing(true);
          }}
          className="text-zinc-500 hover:underline dark:text-zinc-400"
        >
          {targetPrice !== null ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 45"
          disabled={isPending}
          className="w-24 rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={isPending}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
