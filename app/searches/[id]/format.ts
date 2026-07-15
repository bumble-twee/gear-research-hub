// Pure display-formatting helpers shared between the server-rendered
// page and CandidateCard. No timezone-sensitive logic lives here — see
// LocalTime.tsx for anything that must render in the browser's zone.

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
