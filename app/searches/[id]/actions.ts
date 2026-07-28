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

function optionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

// The only manual-entry path into candidates — everything else comes
// from the enrichment agent. Needed so an empty search isn't a dead
// end: source "manual" distinguishes these from agent-researched rows.
export async function addCandidate(searchId: string, formData: FormData) {
  const brand = String(formData.get("brand") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!brand) throw new Error("Brand is required.");
  if (!name) throw new Error("Name is required.");

  const weightRaw = String(formData.get("weight_grams") ?? "").trim();
  let weightGrams: number | null = null;
  if (weightRaw) {
    weightGrams = Number(weightRaw);
    if (!Number.isFinite(weightGrams) || weightGrams < 0) {
      throw new Error("Weight must be a positive number.");
    }
  }

  const { error } = await supabase.from("candidates").insert({
    search_id: searchId,
    brand,
    name,
    size: optionalText(formData, "size"),
    weight_grams: weightGrams,
    brand_url: optionalText(formData, "url"),
    source: "manual",
  });
  if (error) throw error;
  revalidatePath(pagePath(searchId));
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

// Feeds computePriceStats' "Good deal" signal (./format.ts) — an
// optional user budget, not required for the signal to work at all.
export async function setTargetPrice(
  searchId: string,
  candidateId: string,
  targetPrice: number | null
) {
  if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice < 0)) {
    throw new Error("Target price must be a positive number.");
  }

  const { error } = await supabase
    .from("candidates")
    .update({ target_price: targetPrice, updated_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}

// searches.chosen_candidate_id -> candidates(id) has no ON DELETE
// clause (defaults to NO ACTION), so deleting a candidate still
// referenced as its search's chosen one would otherwise fail with a
// foreign key violation. Clear the dangling reference first. Price
// and review snapshots cascade on their own (ON DELETE CASCADE).
export async function deleteCandidate(searchId: string, candidateId: string) {
  const { error: clearErr } = await supabase
    .from("searches")
    .update({ chosen_candidate_id: null })
    .eq("chosen_candidate_id", candidateId);
  if (clearErr) throw clearErr;

  const { error } = await supabase.from("candidates").delete().eq("id", candidateId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}

// A user-provided brand_url is a signal the enrichment agent trusts:
// see runAgentLoop in app/api/enrich/route.ts, which looks up any
// existing candidate's brand_url and tells the agent to fetch it
// directly instead of searching.
export async function setBrandUrl(
  searchId: string,
  candidateId: string,
  brandUrl: string | null
) {
  let normalized: string | null = null;
  if (brandUrl && brandUrl.trim()) {
    const trimmed = brandUrl.trim();
    try {
      new URL(trimmed);
    } catch {
      throw new Error("Enter a valid URL (including https://).");
    }
    normalized = trimmed;
  }

  const { error } = await supabase
    .from("candidates")
    .update({ brand_url: normalized, updated_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}

function cleanStringList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

// Whole-array replace, same pattern as setRequiredFeatures/setPriorities.
// Feeds /api/track-prices, which reads this column directly — a
// candidate with no tracked_urls just gets a no-op "nothing to refresh"
// response from that route rather than an error.
export async function setTrackedUrls(searchId: string, candidateId: string, urls: string[]) {
  const cleaned = cleanStringList(urls);
  for (const url of cleaned) {
    try {
      new URL(url);
    } catch {
      throw new Error(`Not a valid URL: ${url}`);
    }
  }

  const { error } = await supabase
    .from("candidates")
    .update({ tracked_urls: cleaned, updated_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}

export async function setRequiredFeatures(searchId: string, features: string[]) {
  const { error } = await supabase
    .from("searches")
    .update({ required_features: cleanStringList(features) })
    .eq("id", searchId);
  if (error) throw error;
  revalidatePath(pagePath(searchId));
}

// Order is significant — first is most important — so this always
// replaces the whole array rather than patching one entry, keeping
// the client's order authoritative.
export async function setPriorities(searchId: string, priorities: string[]) {
  const { error } = await supabase
    .from("searches")
    .update({ priorities: cleanStringList(priorities) })
    .eq("id", searchId);
  if (error) throw error;
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
