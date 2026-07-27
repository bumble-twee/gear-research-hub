"use client";

import { useState, useTransition } from "react";
import { ChipListInput } from "../../ChipListInput";
import { setRequiredFeatures } from "./actions";

// `features` is driven by the server-fetched search row, not copied
// into local state — after a change persists, revalidatePath refreshes
// the page's props and this just re-renders with the true DB value.
export function RequiredFeaturesEditor({
  searchId,
  features,
}: {
  searchId: string;
  features: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: string[]) {
    setError(null);
    startTransition(async () => {
      try {
        await setRequiredFeatures(searchId, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div>
      <ChipListInput
        label="Required features"
        placeholder="e.g. dyneema construction"
        items={features}
        onChange={handleChange}
        disabled={isPending}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
