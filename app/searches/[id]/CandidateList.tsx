"use client";

import { useMemo, useState } from "react";
import { CandidateCard } from "./CandidateCard";
import type { CandidateRow, PriceSnapshotRow, ReviewSnapshotRow } from "./types";

type SortKey = "fit" | "weight" | "price";
type FilterKey = "all" | "considering" | "rejected";

// Canonical tiebreaker order. The lead key moves to the front; the
// other two keep this relative order behind it.
const SORT_ORDER: SortKey[] = ["fit", "weight", "price"];

const SORT_LABELS: Record<SortKey, string> = {
  fit: "Fit",
  weight: "Weight",
  price: "Price",
};

// Nulls always sort last for the key being compared, regardless of
// which direction that key sorts in.
function compareNullable(
  a: number | null,
  b: number | null,
  direction: "asc" | "desc"
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

const COMPARATORS: Record<SortKey, (a: CandidateRow, b: CandidateRow) => number> = {
  fit: (a, b) => compareNullable(a.fit_rating, b.fit_rating, "desc"),
  weight: (a, b) => compareNullable(a.weight_grams, b.weight_grams, "asc"),
  price: (a, b) => compareNullable(a.current_price, b.current_price, "asc"),
};

function buildComparator(leadKey: SortKey) {
  const order = [leadKey, ...SORT_ORDER.filter((k) => k !== leadKey)];
  return (a: CandidateRow, b: CandidateRow) => {
    for (const key of order) {
      const result = COMPARATORS[key](a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

function matchesFilter(candidate: CandidateRow, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "rejected") return candidate.status === "rejected";
  return candidate.status !== "rejected"; // "considering" tab: considering + shortlisted + chosen
}

export function CandidateList({
  searchId,
  candidates,
  priceByCandidate,
  reviewByCandidate,
}: {
  searchId: string;
  candidates: CandidateRow[];
  priceByCandidate: Record<string, PriceSnapshotRow | null>;
  reviewByCandidate: Record<string, ReviewSnapshotRow | null>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("fit");
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(
    () => ({
      all: candidates.length,
      considering: candidates.filter((c) => c.status !== "rejected").length,
      rejected: candidates.filter((c) => c.status === "rejected").length,
    }),
    [candidates]
  );

  const visible = useMemo(() => {
    const comparator = buildComparator(sortKey);
    return candidates.filter((c) => matchesFilter(c, filter)).sort(comparator);
  }, [candidates, filter, sortKey]);

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
          {(["all", "considering", "rejected"] as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1 capitalize transition-colors ${
                filter === key
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {key} <span className="text-xs text-zinc-400 dark:text-zinc-500">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Sort by</span>
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {SORT_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  sortKey === key
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {visible.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            searchId={searchId}
            candidate={candidate}
            priceSnapshot={priceByCandidate[candidate.id] ?? null}
            reviewSnapshot={reviewByCandidate[candidate.id] ?? null}
          />
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No candidates here.</p>
        )}
      </div>
    </div>
  );
}
