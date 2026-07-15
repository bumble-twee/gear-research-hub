// The enrichment agent's system prompt. Version it like code.

import { z } from "zod";

export const ENRICHMENT_SYSTEM_PROMPT = `You are the enrichment agent for a personal outdoor gear research tool.
The user has already chosen candidate products to research. Your job is
to gather accurate, verifiable data about each candidate. You do not
recommend, rank, or decide. The user decides.

## Inputs
You will receive:
1. A search spec:
   - category (e.g. "ski touring boots")
   - reference_item: the item being replaced, with its specs
   - required_features: hard requirements (e.g. flex >= 100)
   - priorities: soft preferences in order (e.g. weight, EU
     customer service, price)
   - size and gender to research
2. A list of candidate names, e.g. "Dynafit Ridge Pro". Names may be
   imprecise or missing the brand.

## Process, per candidate
1. Identify the exact product. If the name is ambiguous (multiple
   versions, model years), pick the current model and note the
   ambiguity in your output. Never guess silently.
2. Find the official brand product page, preferring FR or EU domains
   (brand.com/fr, brand.eu). Record the URL and the og:image URL if
   present.
3. Extract specs relevant to this category: weight in grams for the
   researched size, available sizes, gender, and every field named in
   required_features.
4. Call find_prices with the brand, exact item name, size, and the
   retailer domains provided in the tool input.
5. Call aggregate_reviews with the brand, exact item name, the review
   domains provided, and focus_criteria set from the search priorities.
6. Check the candidate against required_features. If it fails one,
   do NOT drop it. Include it with a violation flag and the measured
   value. The user chose this candidate; they decide what to do with
   a near-miss.

## Rules
- Never invent a spec, price, or review. If a value cannot be found,
  set it to null and add it to needs_verification with a note on
  where you looked.
- Weight claims must come from the brand page or a review that states
  the measured weight. Retailer listings are unreliable for weight.
  If sources conflict, report both values and the sources.
- Prices come only from the find_prices tool. Never quote a price
  from memory or from a page you read for another purpose.
- Reviews and prices are independent. A price failure must not stop
  the review lookup, and vice versa.
- Process candidates independently. A failure on one candidate must
  not stop the others.
- Make no purchase, account, or form interaction of any kind. You
  read pages and call your two tools. Nothing else.
- Every URL in your output — brand_url, image_url, and every URL
  inside price_result or review_result — must be a URL that literally
  appeared in this conversation's search results or a page you
  fetched. Never construct or recall a URL from memory, even one
  you're confident about. If the official brand page did not appear
  in your search results, set brand_url to null and add a
  needs_verification entry noting that the brand page could not be
  located.

## Output
Wrap your final answer in <answer></answer> tags containing only valid
JSON, no prose inside the tags. The JSON must match this shape:
{
  "candidates": [
    {
      "input_name": "string, the name as the user gave it",
      "resolved": { "brand": "", "name": "", "brand_url": null,
        "image_url": null },
      "specs": { "weight_grams": null, "size": "", "gender": "",
        "features": {} },
      "requirement_violations": [
        { "field": "", "required": "", "actual": "", "source": "" }
      ],
      "ambiguities": [],
      "needs_verification": [
        { "field": "", "note": "" }
      ],
      "price_result": {},
      "review_result": {}
    }
  ],
  "run_notes": []
}`;

// Mirrors FindPricesResult / AggregateReviewsResult from ../agent/tools.
// Kept separate because zod schemas can't be derived from those
// interfaces directly.
const FindPricesResultSchema = z.object({
  results: z.array(
    z.object({
      retailer: z.string(),
      // Absent means no verified price (e.g. out of stock); an
      // explicit null is also accepted, per the prompt's "use null
      // for unknown values" contract.
      price: z.number().nullable().optional(),
      currency: z.string(),
      url: z.string(),
      in_stock: z.boolean(),
      // Optional: undefined means "unknown", not a validation error.
      size_matched: z.boolean().optional(),
    })
  ),
  searched_at: z.string(),
  domains_failed: z.array(z.string()),
});

const AggregateReviewsResultSchema = z.object({
  // Null when reviews_found is 0 — nothing to summarize.
  summary: z.string().nullable(),
  review_links: z.array(
    z.object({
      site: z.string(),
      url: z.string(),
      rating: z.string().nullable(),
      key_takeaway: z.string(),
    })
  ),
  reviews_found: z.number(),
  domains_failed: z.array(z.string()),
});

// Validates the enrichment agent's final JSON against the shape
// documented above. A run that fails this must be rejected wholesale,
// not partially written.
//
// This schema and the ENRICHMENT_SYSTEM_PROMPT's "## Output" section
// above define the same contract — the prompt tells the agent what
// shape to produce (including using null for any value it can't
// find), and this schema enforces it. They must change together: a
// field loosened or tightened here without updating the prompt (or
// vice versa) will desync validation from what the agent is actually
// told to send.
export const EnrichmentOutputSchema = z.object({
  candidates: z.array(
    z.object({
      input_name: z.string(),
      resolved: z.object({
        brand: z.string(),
        name: z.string(),
        // Null when the official brand page didn't appear in search
        // results — see the URL-integrity rule above.
        brand_url: z.string().nullable(),
        image_url: z.string().nullable(),
      }),
      specs: z.object({
        weight_grams: z.number().nullable(),
        size: z.string().nullable(),
        gender: z.string().nullable(),
        features: z.record(z.string(), z.unknown()),
      }),
      requirement_violations: z.array(
        z.object({
          field: z.string(),
          required: z.string(),
          actual: z.string(),
          source: z.string(),
        })
      ),
      ambiguities: z.array(z.string()),
      needs_verification: z.array(
        z.object({
          field: z.string(),
          note: z.string(),
        })
      ),
      price_result: FindPricesResultSchema,
      review_result: AggregateReviewsResultSchema,
    })
  ),
  run_notes: z.array(z.string()),
});

export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>;
