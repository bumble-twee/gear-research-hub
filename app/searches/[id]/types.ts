// Row shapes as they come back from Supabase for this page. Kept local
// to this route rather than shared globally — nothing else reads these
// yet.

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
  category: string;
  replaces_item_id: string | null;
  reference_item: string | null;
  required_features: Record<string, unknown>;
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
