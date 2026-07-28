// Row shapes as they come back from Supabase. Originally scoped to
// this route; the searches index page (app/page.tsx) now also imports
// SearchRow directly from here rather than duplicating it.

export type SearchStatus = "active" | "decided" | "abandoned";
export type CandidateStatus = "considering" | "shortlisted" | "rejected" | "chosen";

export interface OwnedItemRow {
  id: string;
  brand: string;
  name: string;
  category: string;
  purchased_at: string | null;
  purchase_price: number | null;
  currency: string | null;
  retired_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface SearchRow {
  id: string;
  title: string;
  // Nullable: no longer collected by the new-search form or shown in
  // the detail header; kept on the row for future use.
  category: string | null;
  replaces_item_id: string | null;
  reference_item: string | null;
  // Freeform requirement strings (e.g. "dyneema construction"), not a
  // field:value map. Older rows may still hold the schema default '{}'
  // object from before this shape existed — see normalizeRequiredFeatures
  // in ./format.ts, which every reader of this column goes through.
  required_features: string[];
  priorities: string[];
  size: string | null;
  gender: string | null;
  status: SearchStatus;
  chosen_candidate_id: string | null;
  decision_notes: string | null;
  created_at: string;
}

export interface CandidateRow {
  id: string;
  search_id: string;
  brand: string;
  name: string;
  brand_url: string | null;
  image_url: string | null;
  size: string | null;
  weight_grams: number | null;
  gender: string | null;
  features: Record<string, unknown>;
  status: CandidateStatus;
  rejection_reason: string | null;
  source: "manual" | "agent";
  input_name: string | null;
  requirement_violations: {
    field: string;
    required: string;
    actual: string;
    source: string;
  }[];
  needs_verification: { field: string; note: string }[];
  fit_rating: number | null;
  fit_notes: string | null;
  tried_on_at: string | null;
  current_price: number | null;
  current_price_currency: string | null;
  current_price_retailer: string | null;
  current_price_url: string | null;
  price_updated_at: string | null;
  // Optional user-set budget, feeds the price-history "Good deal"
  // signal. See supabase/migrations/006_add_target_price.sql.
  target_price: number | null;
  // Populated later, by a future feature, once the user chases a
  // discovery-agent lead down — always empty on insert. See
  // supabase/migrations/005_add_tracked_urls.sql and app/api/discover.
  tracked_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface PriceSnapshotRow {
  id: string;
  candidate_id: string;
  price: number | null;
  currency: string;
  retailer: string;
  url: string | null;
  in_stock: boolean | null;
  size_matched: boolean | null;
  domains_failed: string[];
  captured_at: string;
}

export interface ReviewLink {
  site: string;
  url: string;
  rating: string | null;
  key_takeaway: string;
}

export interface ReviewSnapshotRow {
  id: string;
  candidate_id: string;
  summary: string | null;
  review_links: ReviewLink[];
  reviews_found: number;
  domains_failed: string[];
  captured_at: string;
}
