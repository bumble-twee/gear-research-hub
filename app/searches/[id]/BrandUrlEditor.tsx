"use client";

import { useState, useTransition } from "react";
import { ExternalLinkIcon } from "@/app/icons";
import { setBrandUrl } from "./actions";

// Editable brand_url on a candidate card. A value set here (or on the
// manual add form) is trusted as canonical by the enrichment agent —
// see runAgentLoop in app/api/enrich/route.ts.
export function BrandUrlEditor({
  searchId,
  candidateId,
  brandUrl,
}: {
  searchId: string;
  candidateId: string;
  brandUrl: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(brandUrl ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setBrandUrl(searchId, candidateId, value.trim() || null);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {brandUrl ? (
          <a
            href={brandUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
          >
            Brand page
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-zinc-400 dark:text-zinc-500">No brand page set</span>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(brandUrl ?? "");
            setEditing(true);
          }}
          className="text-zinc-500 hover:underline dark:text-zinc-400"
        >
          {brandUrl ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://brand.com/product"
          disabled={isPending}
          className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
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
