"use client";

import { useState, useTransition } from "react";
import { ChipListInput } from "../../ChipListInput";
import { setPriorities } from "./actions";

export function PrioritiesEditor({
  searchId,
  priorities,
}: {
  searchId: string;
  priorities: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: string[]) {
    setError(null);
    startTransition(async () => {
      try {
        await setPriorities(searchId, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div>
      <ChipListInput
        label="Priorities — order matters, first is most important"
        placeholder="e.g. low weight"
        items={priorities}
        onChange={handleChange}
        numbered
        disabled={isPending}
        chipClassName="border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
