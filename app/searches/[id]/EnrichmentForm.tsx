"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface EnrichCandidateResult {
  input_name: string;
  candidateId?: string;
  error?: string;
}

interface EnrichResponse {
  status?: string;
  error?: string;
  run_notes?: string[];
  candidates?: EnrichCandidateResult[];
}

// Calls the existing /api/enrich route directly (a Route Handler, not
// a Server Action) — same fetch-then-router.refresh() pattern already
// used by the per-candidate "Refresh price"/"Refresh reviews" buttons
// in CandidateCard.tsx. The request runs against the live Anthropic
// API with web search unless MOCK_TOOLS is set, so it's the one
// control on this page that spends real money — the warning below is
// not decorative.
export function EnrichmentForm({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState("");
  const [running, setRunning] = useState(false);
  const [runningCount, setRunningCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [runNotes, setRunNotes] = useState<string[]>([]);
  const [candidateErrors, setCandidateErrors] = useState<
    { input_name: string; error: string }[]
  >([]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Run enrichment
      </button>
    );
  }

  const candidateNames = names
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);

  async function runEnrichment() {
    setError(null);
    setRunNotes([]);
    setCandidateErrors([]);
    setRunningCount(candidateNames.length);
    setRunning(true);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId, candidateNames }),
      });

      // A non-ok response isn't guaranteed to be JSON (e.g. the Basic
      // Auth proxy returning a plain-text 401) — never call .json() on
      // it blindly.
      if (!res.ok) {
        setError(`Enrichment request failed: ${res.status} ${res.statusText}`);
        return;
      }

      const data: EnrichResponse = await res.json();

      setCandidateErrors(
        (data.candidates ?? [])
          .filter((c): c is EnrichCandidateResult & { error: string } => Boolean(c.error))
          .map((c) => ({ input_name: c.input_name, error: c.error }))
      );
      setRunNotes(data.run_notes ?? []);
      setNames("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const hasNotice = error || candidateErrors.length > 0 || runNotes.length > 0;

  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (candidateNames.length === 0) {
            setError("Enter at least one candidate name.");
            return;
          }
          runEnrichment();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            Candidate names, one per line
          </span>
          <textarea
            value={names}
            onChange={(e) => setNames(e.target.value)}
            rows={4}
            disabled={running}
            placeholder={"Petzl Laser Speed Light\nBlue Ice Aero Lite"}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
          />
        </label>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Live enrichment calls the Anthropic API with web search for every
          candidate listed and costs real API credits — it isn&apos;t free to run.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={running}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {running ? "Running…" : "Start enrichment"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={running}
            className="text-sm text-zinc-500 hover:underline disabled:opacity-50 dark:text-zinc-400"
          >
            Cancel
          </button>
        </div>

        {running && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Enriching {runningCount} candidate{runningCount === 1 ? "" : "s"}, this can
            take a few minutes.
          </p>
        )}

        {hasNotice && (
          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            {error && <p className="font-medium">{error}</p>}
            {candidateErrors.length > 0 && (
              <>
                <p className={error ? "mt-2 font-medium" : "font-medium"}>
                  Candidate errors:
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {candidateErrors.map((c, i) => (
                    <li key={i}>
                      {c.input_name}: {c.error}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {runNotes.length > 0 && (
              <>
                <p
                  className={
                    error || candidateErrors.length > 0 ? "mt-2 font-medium" : "font-medium"
                  }
                >
                  Run notes:
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {runNotes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
