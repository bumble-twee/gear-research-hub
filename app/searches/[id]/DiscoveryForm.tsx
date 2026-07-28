"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DiscoveredCandidateResult {
  brand: string;
  product_line_name: string;
  candidateId?: string;
  error?: string;
}

interface DiscoverResponse {
  status?: string;
  error?: string;
  run_notes?: string[];
  candidates?: DiscoveredCandidateResult[];
}

// The other of two ways to get a candidate onto this search — agent-
// driven discovery, via /api/discover (a Route Handler, not a Server
// Action; same fetch-then-router.refresh() pattern already used by the
// per-candidate "Refresh price" button in CandidateCard.tsx).
// Discovery proposes leads from the search's own requirements alone —
// no candidate names to type in — so unlike the old enrichment form
// this is a single button, not a textarea. It never fetches prices;
// add tracked URLs to a resulting candidate afterward to start that.
// Visibility is owned by the parent AddCandidatesPanel. The request
// runs against the live Anthropic API with web search unless
// MOCK_TOOLS is set, so it's the one control on this page that spends
// real money — the subtitle below is not decorative.
export function DiscoveryForm({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runNotes, setRunNotes] = useState<string[]>([]);
  const [candidateErrors, setCandidateErrors] = useState<{ label: string; error: string }[]>(
    []
  );
  const [addedCount, setAddedCount] = useState<number | null>(null);

  async function runDiscovery() {
    setError(null);
    setRunNotes([]);
    setCandidateErrors([]);
    setAddedCount(null);
    setRunning(true);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId }),
      });

      // A non-ok response isn't guaranteed to be JSON (e.g. the Basic
      // Auth proxy returning a plain-text 401) — never call .json() on
      // it blindly.
      if (!res.ok) {
        setError(`Discovery request failed: ${res.status} ${res.statusText}`);
        return;
      }

      const data: DiscoverResponse = await res.json();
      const candidates = data.candidates ?? [];

      setCandidateErrors(
        candidates
          .filter((c): c is DiscoveredCandidateResult & { error: string } => Boolean(c.error))
          .map((c) => ({ label: `${c.brand} ${c.product_line_name}`, error: c.error }))
      );
      setAddedCount(candidates.filter((c) => c.candidateId).length);
      setRunNotes(data.run_notes ?? []);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const hasNotice = error || candidateErrors.length > 0 || runNotes.length > 0 || addedCount !== null;

  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Discover candidates automatically
      </h3>
      <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
        Proposes real product leads from this search&apos;s requirements using the
        Anthropic API with web search — it isn&apos;t free to run. It only suggests
        candidates and never fetches prices; add retailer URLs to a candidate
        afterward to start tracking price.
      </p>

      <div className="mt-3">
        <button
          type="button"
          onClick={runDiscovery}
          disabled={running}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {running ? "Running…" : "Start discovery"}
        </button>
      </div>

      {running && (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Looking for candidates, this can take a minute.
        </p>
      )}

      {hasNotice && (
        <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {error && <p className="font-medium">{error}</p>}
          {addedCount !== null && !error && (
            <p className="font-medium">
              Added {addedCount} candidate{addedCount === 1 ? "" : "s"}.
            </p>
          )}
          {candidateErrors.length > 0 && (
            <>
              <p className="mt-2 font-medium">Candidate errors:</p>
              <ul className="mt-1 list-disc pl-4">
                {candidateErrors.map((c, i) => (
                  <li key={i}>
                    {c.label}: {c.error}
                  </li>
                ))}
              </ul>
            </>
          )}
          {runNotes.length > 0 && (
            <>
              <p className="mt-2 font-medium">Run notes:</p>
              <ul className="mt-1 list-disc pl-4">
                {runNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
