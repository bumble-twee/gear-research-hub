"use server";

// Server Actions for this route only. Each one is a narrow, single-
// purpose write against Supabase, re-validated here even though the
// UI already guards the same rules — actions are POST endpoints
// reachable independent of the form that renders them.
//
// None of these touch price_snapshots or review_snapshots; those stay
// owned by writeSnapshotAndCache (see lib/db/writeSnapshotAndCache.ts).

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function pagePath(searchId: string) {
  return `/searches/${searchId}`;
}

export async function setCandidateStatus(
  searchId: string,
  candidateId: string,
  status: "considering" | "shortlisted"
) {
  const { error } = await supabase
    .from("candidates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}

export async function rejectCandidate(
  searchId: string,
  candidateId: string,
  rejectionReason: string
) {
  const reason = rejectionReason.trim();
  if (!reason) throw new Error("A rejection reason is required.");

  const { error } = await supabase
    .from("candidates")
    .update({
      status: "rejected",
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}

export async function restoreCandidate(searchId: string, candidateId: string) {
  const { error } = await supabase
    .from("candidates")
    .update({
      status: "considering",
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}

// Chosen is a search-level decision, not just a candidate flag: it
// also marks the search decided and records which candidate won.
export async function chooseCandidate(searchId: string, candidateId: string) {
  const { error: candErr } = await supabase
    .from("candidates")
    .update({ status: "chosen", updated_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (candErr) throw candErr;

  const { error: searchErr } = await supabase
    .from("searches")
    .update({ chosen_candidate_id: candidateId, status: "decided" })
    .eq("id", searchId);
  if (searchErr) throw searchErr;

  revalidatePath(pagePath(searchId));
}

export async function logFit(
  searchId: string,
  candidateId: string,
  fitRating: number,
  fitNotes: string | null,
  triedOnAt: string
) {
  if (!Number.isInteger(fitRating) || fitRating < 1 || fitRating > 5) {
    throw new Error("Fit rating must be between 1 and 5.");
  }
  if (!triedOnAt) throw new Error("A tried-on date is required.");

  const { error } = await supabase
    .from("candidates")
    .update({
      fit_rating: fitRating,
      fit_notes: fitNotes,
      tried_on_at: triedOnAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}
