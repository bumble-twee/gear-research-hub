"use client";

import { useState, useTransition } from "react";
import { ExternalLinkIcon } from "@/app/icons";
import { setTrackedUrls } from "./actions";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Retailer product-page URLs that /api/track-prices reads directly
// (JSON-LD / Open Graph / regex extraction from each page — no web
// search). Distinct from brand_url (the canonical product page,
// editable via BrandUrlEditor): a candidate can have several tracked
// URLs, one per retailer, and none of them need to match brand_url.
export function TrackedUrlsEditor({
  searchId,
  candidateId,
  trackedUrls,
}: {
  searchId: string;
  candidateId: string;
  trackedUrls: string[];
}) {
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function persist(next: string[]) {
    setError(null);
    startTransition(async () => {
      try {
        await setTrackedUrls(searchId, candidateId, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function add() {
    const value = draft.trim();
    if (!value) return;
    try {
      new URL(value);
    } catch {
      setError("Enter a valid URL (including https://).");
      return;
    }
    if (trackedUrls.includes(value)) {
      setDraft("");
      return;
    }
    persist([...trackedUrls, value]);
    setDraft("");
  }

  function remove(url: string) {
    persist(trackedUrls.filter((u) => u !== url));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Tracked retailer URLs
      </p>

      {trackedUrls.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Add retailer URLs to start tracking price.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {trackedUrls.map((url) => (
            <li key={url} className="flex items-center gap-2 text-xs">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={url}
                className="inline-flex min-w-0 items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                <span className="truncate">{hostnameOf(url)}</span>
                <ExternalLinkIcon />
              </a>
              <button
                type="button"
                disabled={isPending}
                onClick={() => remove(url)}
                aria-label={`Remove ${url}`}
                className="shrink-0 text-zinc-400 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="https://retailer.com/product"
          disabled={isPending}
          className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          type="button"
          onClick={add}
          disabled={isPending}
          className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Add
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
