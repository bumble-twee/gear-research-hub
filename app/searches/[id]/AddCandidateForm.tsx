"use client";

import { useState, useTransition } from "react";
import { addCandidate } from "./actions";

// Manual candidate entry — the only way into an empty search besides
// running enrichment, so it has to stand on its own without any
// existing candidates to react against.
export function AddCandidateForm({ searchId }: { searchId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Add candidate
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            try {
              await addCandidate(searchId, formData);
              setOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" name="brand" required />
          <Field label="Name" name="name" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size (optional)" name="size" />
          <Field label="Weight, grams (optional)" name="weight_grams" type="number" />
        </div>
        <Field label="Product URL (optional)" name="url" type="url" />

        <div className="mt-1 flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {isPending ? "Adding…" : "Add candidate"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  required = false,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
      />
    </label>
  );
}
