// Pure display-formatting helpers shared between the server-rendered
// page and CandidateCard. No timezone-sensitive logic lives here — see
// LocalTime.tsx for anything that must render in the browser's zone.

import type { PriceSnapshotRow } from "./types";

export function humanizeAge(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < week) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs < month) return `${Math.floor(diffMs / week)}w ago`;
  if (diffMs < year) return `${Math.floor(diffMs / month)}mo ago`;
  return `${Math.floor(diffMs / year)}y ago`;
}

// Date-only arithmetic (calendar years/months owned), not a timestamp
// display, so no browser-timezone concern here.
export function ownedDuration(purchasedAt: string): { years: number; months: number } {
  const start = new Date(purchasedAt);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years: Math.max(0, years), months: Math.max(0, months) };
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

export function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return "";
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

export function formatPrice(price: number, currency: string | null | undefined): string {
  return `${currencySymbol(currency)}${price.toFixed(2)}`;
}

// searches.required_features is jsonb with no shape constraint at the
// DB level. Rows created before this column meant "list of freeform
// requirement strings" still hold the old schema default '{}' (an
// empty object). Every reader of this column goes through here so a
// legacy row degrades to an empty list instead of throwing when code
// expects an array.
export function normalizeRequiredFeatures(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function specsLine(size: string | null, weightGrams: number | null): string {
  const parts: string[] = [];
  if (size) parts.push(size);
  if (weightGrams !== null) parts.push(`${weightGrams}g`);
  return parts.join(" · ");
}

const NEEDS_VERIFICATION_LABELS: Record<string, string> = {
  brand_url: "Brand page not found",
  image_url: "No product image",
  weight_grams: "Weight unconfirmed",
  size: "Size unconfirmed",
};

export function needsVerificationLabel(field: string): string {
  return NEEDS_VERIFICATION_LABELS[field] ?? `${field} unconfirmed`;
}

// Static "Find reviews" links, one per preferred review site — no API
// call, no review_snapshots write. A Google site-search works
// uniformly across every domain without needing each site's own
// internal search URL pattern on file.
export function buildReviewSearchUrl(domain: string, brand: string, name: string): string {
  const query = `site:${domain} ${brand} ${name}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export type PriceSignal = "good_deal" | "typical" | "wait";

export interface PriceStats {
  current: number;
  currency: string;
  lowest: number;
  average: number;
  // 0 when current equals the lowest ever seen; positive otherwise.
  vsLowestPct: number;
  signal: PriceSignal;
  // Chronological (oldest first) priced values, for the sparkline.
  history: number[];
}

// Within this of the lowest ever seen still counts as "at/near the
// lowest" for the good-deal signal — a hand-picked, documented
// threshold, not a fitted one.
const NEAR_LOWEST_PCT = 5;

// Straight arithmetic over price_snapshots — no LLM judgment anywhere
// in this function. `history` must be sorted newest-first (matches
// the query order already used elsewhere on this page); returns null
// when there's no priced snapshot to compute from at all.
export function computePriceStats(
  history: PriceSnapshotRow[],
  targetPrice: number | null
): PriceStats | null {
  const priced = history.filter(
    (s): s is PriceSnapshotRow & { price: number } => typeof s.price === "number"
  );
  if (priced.length === 0) return null;

  const current = priced[0].price;
  const currency = priced[0].currency;
  const lowest = Math.min(...priced.map((s) => s.price));
  const average = priced.reduce((sum, s) => sum + s.price, 0) / priced.length;
  const vsLowestPct = lowest > 0 ? ((current - lowest) / lowest) * 100 : 0;

  const isNearLowest = vsLowestPct <= NEAR_LOWEST_PCT;
  const isAtOrBelowTarget = targetPrice !== null && current <= targetPrice;
  const isAboveAverage = current > average;

  let signal: PriceSignal;
  if (isNearLowest || isAtOrBelowTarget) {
    signal = "good_deal";
  } else if (isAboveAverage) {
    signal = "wait";
  } else {
    signal = "typical";
  }

  return {
    current,
    currency,
    lowest,
    average,
    vsLowestPct,
    signal,
    // Oldest first for a left-to-right sparkline.
    history: [...priced].reverse().map((s) => s.price),
  };
}

export const PRICE_SIGNAL_LABELS: Record<PriceSignal, string> = {
  good_deal: "Good deal",
  typical: "Typical",
  wait: "Wait",
};

// Text-only variant (both light/dark), for coloring the sparkline via
// currentColor — kept separate from the badge background above rather
// than extracted from it at render time.
export const PRICE_SIGNAL_TEXT_STYLES: Record<PriceSignal, string> = {
  good_deal: "text-green-700 dark:text-green-400",
  typical: "text-zinc-400 dark:text-zinc-500",
  wait: "text-amber-700 dark:text-amber-400",
};

export const PRICE_SIGNAL_STYLES: Record<PriceSignal, string> = {
  good_deal: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  typical: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  wait: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

export const SEARCH_STATUS_STYLES: Record<string, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  decided: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  abandoned: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export const CANDIDATE_STATUS_STYLES: Record<string, string> = {
  considering: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  shortlisted: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  chosen: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};
