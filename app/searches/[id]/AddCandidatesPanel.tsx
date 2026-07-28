"use client";

import { useState } from "react";
import { AddCandidateForm } from "./AddCandidateForm";
import { DiscoveryForm } from "./DiscoveryForm";

// Two genuinely different ways to get a candidate onto this search —
// manual entry (free, instant, for a candidate you found yourself) vs.
// agent-driven discovery (costs API credits, proposes leads from the
// search's own requirements — you add tracked URLs to a lead
// afterward). They stay separate flows; this only collapses both
// behind one toggle so the default view isn't two open forms.
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
          <DiscoveryForm searchId={searchId} />
        </div>
      )}
    </div>
  );
}
