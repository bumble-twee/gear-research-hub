"use client";

import { useState } from "react";
import { AddCandidateForm } from "./AddCandidateForm";
import { EnrichmentForm } from "./EnrichmentForm";

// Two genuinely different ways to get a candidate onto this search —
// manual entry (free, instant, no research) vs. agent-driven
// enrichment (costs API credits, does the research for you). They
// stay separate flows; this only collapses both behind one toggle so
// the default view isn't two open forms.
export function AddCandidatesPanel({ searchId }: { searchId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {open ? "Cancel" : "Add candidates"}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          <AddCandidateForm searchId={searchId} />
          <EnrichmentForm searchId={searchId} />
        </div>
      )}
    </div>
  );
}
