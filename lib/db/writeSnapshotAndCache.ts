// THE guardrail. The current_price fields on candidates are a cache
// of the latest price_snapshot. They must never drift apart, so this
// is the ONLY file allowed to write either. Same rule applies to
// review snapshots (no cache there, but kept here so all snapshot
// writes go through one door).
//
// Two price-writing shapes live here, for two different callers:
// - writePriceSnapshotAndCache: one row per call, summarizing the
//   cheapest in-stock result across a batch of retailer domains
//   (find_prices' shape — searching multiple sites for one product).
// - writeTrackedPriceSnapshotsAndCache: one row per URL, for
//   /api/track-prices — the user is tracking specific product pages
//   directly, so each URL's own price history is worth keeping, not
//   just the cheapest-of-the-run. Still updates the cache exactly
//   once, to the true minimum across all of them.

import { createClient } from "@supabase/supabase-js";
import type { FindPricesResult, AggregateReviewsResult } from "../agent/tools";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only, never expose
);

export async function writePriceSnapshotAndCache(
  candidateId: string,
  result: FindPricesResult
) {
  // Recompute independently of any upstream sort: only an in-stock
  // result with an actual price can become the snapshot/cache value.
  const priced = result.results.filter(
    (r): r is typeof r & { price: number } =>
      r.in_stock && typeof r.price === "number"
  );
  const cheapest =
    priced.length > 0
      ? priced.reduce((min, r) => (r.price < min.price ? r : min))
      : null;

  // Supabase JS has no multi-statement transactions; use an RPC for
  // true atomicity later. For v1, snapshot first, cache second, and
  // treat a cache failure as fatal so it gets retried together.
  const { error: snapErr } = await supabase.from("price_snapshots").insert({
    candidate_id: candidateId,
    price: cheapest?.price ?? null,
    currency: cheapest?.currency ?? "EUR",
    retailer: cheapest?.retailer ?? "none_found",
    url: cheapest?.url ?? null,
    in_stock: cheapest?.in_stock ?? null,
    size_matched: cheapest?.size_matched ?? null,
    domains_failed: result.domains_failed,
    captured_at: result.searched_at,
  });
  if (snapErr) throw snapErr;

  if (cheapest) {
    const { error: cacheErr } = await supabase
      .from("candidates")
      .update({
        current_price: cheapest.price,
        current_price_currency: cheapest.currency,
        current_price_retailer: cheapest.retailer,
        current_price_url: cheapest.url,
        price_updated_at: result.searched_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (cacheErr) throw cacheErr;
  }
}

export interface TrackedUrlResult {
  url: string;
  retailer: string;
  price: number | null;
  currency: string;
  in_stock: boolean | null;
}

// One row per successfully-parsed URL (append-only price history per
// tracked page), one shared domains_failed list across all of them
// (the URLs that couldn't be parsed this run), and a single cache
// update to the true cheapest in-stock price across every URL —
// never just whichever URL happened to be processed last.
export async function writeTrackedPriceSnapshotsAndCache(
  candidateId: string,
  results: TrackedUrlResult[],
  domainsFailed: string[],
  capturedAt: string
) {
  if (results.length > 0) {
    const { error: insertErr } = await supabase.from("price_snapshots").insert(
      results.map((r) => ({
        candidate_id: candidateId,
        price: r.price,
        currency: r.currency,
        retailer: r.retailer,
        url: r.url,
        in_stock: r.in_stock,
        size_matched: null,
        domains_failed: domainsFailed,
        captured_at: capturedAt,
      }))
    );
    if (insertErr) throw insertErr;
  } else if (domainsFailed.length > 0) {
    // Every tracked URL failed to parse this run — still record that,
    // mirroring writePriceSnapshotAndCache's none_found placeholder
    // for a batch where nothing usable came back.
    const { error: insertErr } = await supabase.from("price_snapshots").insert({
      candidate_id: candidateId,
      price: null,
      currency: "EUR",
      retailer: "none_found",
      url: null,
      in_stock: null,
      size_matched: null,
      domains_failed: domainsFailed,
      captured_at: capturedAt,
    });
    if (insertErr) throw insertErr;
  }

  const priced = results.filter(
    (r): r is TrackedUrlResult & { price: number } =>
      r.in_stock === true && typeof r.price === "number"
  );
  const cheapest =
    priced.length > 0 ? priced.reduce((min, r) => (r.price < min.price ? r : min)) : null;

  if (cheapest) {
    const { error: cacheErr } = await supabase
      .from("candidates")
      .update({
        current_price: cheapest.price,
        current_price_currency: cheapest.currency,
        current_price_retailer: cheapest.retailer,
        current_price_url: cheapest.url,
        price_updated_at: capturedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (cacheErr) throw cacheErr;
  }
}

export async function writeReviewSnapshot(
  candidateId: string,
  result: AggregateReviewsResult
) {
  const { error } = await supabase.from("review_snapshots").insert({
    candidate_id: candidateId,
    summary: result.summary,
    review_links: result.review_links,
    reviews_found: result.reviews_found,
    domains_failed: result.domains_failed,
  });
  if (error) throw error;
}
