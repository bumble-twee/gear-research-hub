"use client";

import { useState, useTransition } from "react";
import { addCandidate } from "./actions";

// One of two ways to get a candidate onto this search — manual entry,
// free and instant. Visibility is owned by the parent AddCandidatesPanel;
// this only manages its own field state and submission.
export function AddCandidateForm({ searchId }: { searchId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Add one manually
      </h3>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        Enter details yourself. No web search, free.
      </p>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const form = e.currentTarget;
          const formData = new FormData(form);
          startTransition(async () => {
            try {
              await addCandidate(searchId, formData);
              form.reset();
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

        <div className="mt-1">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {isPending ? "Adding…" : "Add candidate"}
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
