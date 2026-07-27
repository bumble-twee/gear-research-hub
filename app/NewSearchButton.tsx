"use client";

import { useState, useTransition } from "react";
import { ChipListInput } from "./ChipListInput";
import { createSearch } from "./actions";

export function NewSearchButton() {
  const [open, setOpen] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {open ? "Cancel" : "New search"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-5 shadow-lg sm:w-96 dark:border-zinc-800 dark:bg-zinc-900">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const formData = new FormData(e.currentTarget);
              // ChipListInput items aren't real form fields (they're
              // rendered as chips, not named inputs) — append them
              // manually so createSearch's formData.getAll(...) sees them.
              features.forEach((f) => formData.append("required_features", f));
              priorities.forEach((p) => formData.append("priorities", p));
              startTransition(async () => {
                try {
                  await createSearch(formData);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              });
            }}
          >
            <Field label="Title" name="title" required />
            <Field label="Reference item (optional)" name="reference_item" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Size (optional)" name="size" />
              <Field label="Gender (optional)" name="gender" />
            </div>

            <ChipListInput
              label="Required features (optional)"
              placeholder="e.g. dyneema construction"
              items={features}
              onChange={setFeatures}
            />
            <ChipListInput
              label="Priorities (optional) — order matters, first is most important"
              placeholder="e.g. low weight"
              items={priorities}
              onChange={setPriorities}
              numbered
              chipClassName="border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            />

            <div className="mt-1 flex items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {isPending ? "Creating…" : "Create search"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
              >
                Cancel
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  required = false,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        name={name}
        required={required}
        className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
      />
    </label>
  );
}
