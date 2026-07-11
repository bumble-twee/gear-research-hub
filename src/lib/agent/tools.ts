// Tool definitions passed to the Claude API.
// The implementations live in /api/tools/* and are ALSO called
// directly by UI refresh buttons. Same code, two entry points.

export const findPricesTool = {
  name: "find_prices",
  description:
    "Search preferred retail sites for current prices of a specific product. Returns all prices found, sorted cheapest first.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string" },
      item_name: { type: "string" },
      size: {
        type: "string",
        description: "Optional. Size variant to price, e.g. '26.5' or 'M'",
      },
      retailer_domains: {
        type: "array",
        items: { type: "string" },
        description:
          "Domains to search, from preferred_sites where site_type = 'retailer'",
      },
    },
    required: ["brand", "item_name", "retailer_domains"],
  },
};

export const aggregateReviewsTool = {
  name: "aggregate_reviews",
  description:
    "Search preferred review sites for reviews of a specific product. Returns links and a synthesized summary.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string" },
      item_name: { type: "string" },
      review_domains: {
        type: "array",
        items: { type: "string" },
        description:
          "Domains from preferred_sites where site_type = 'review'",
      },
      focus_criteria: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional. What to prioritize in the summary, from the search's priorities.",
      },
    },
    required: ["brand", "item_name", "review_domains"],
  },
};

export interface FindPricesResult {
  results: {
    retailer: string;
    price: number;
    currency: string;
    url: string;
    in_stock: boolean;
    size_matched: boolean;
  }[];
  searched_at: string;
  domains_failed: string[];
}

export interface AggregateReviewsResult {
  summary: string;
  review_links: {
    site: string;
    url: string;
    rating: string | null;
    key_takeaway: string;
  }[];
  reviews_found: number;
  domains_failed: string[];
}
