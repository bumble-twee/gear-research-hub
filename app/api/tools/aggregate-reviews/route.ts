// Standalone tool, same two-caller pattern as find-prices.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { writeReviewSnapshot } from "@/lib/db/writeSnapshotAndCache";
import type { AggregateReviewsResult } from "@/lib/agent/tools";
import mockAggregateReviews from "@/lib/fixtures/aggregate-reviews.json";
import { isMockMode, isDebugTools } from "@/lib/env";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { brand, item_name, review_domains, focus_criteria, candidateId } =
    await req.json();

  const mockMode = isMockMode();
  console.log(`[aggregate-reviews] mode: ${mockMode ? "MOCK" : "LIVE"}`);

  let parsed: AggregateReviewsResult;

  if (mockMode) {
    parsed = mockAggregateReviews as AggregateReviewsResult;
  } else {
    const focusClause =
      focus_criteria && focus_criteria.length > 0
        ? ` Weight the summary toward what matters most to this user: ${focus_criteria.join(
            ", "
          )}. Call out how the product performs on each of these specifically, not just general impressions.`
        : "";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Find reviews for ${brand} ${item_name} on each review domain: ${review_domains.join(
            ", "
          )}.

Search every listed domain.${focusClause} Write a synthesized summary of what reviewers say, not a list of separate per-site summaries. Output your final answer as JSON wrapped in <answer></answer> tags, with no other text inside the tags.

The JSON must match:
{"summary":"<synthesized summary weighted toward the focus criteria>","review_links":[{"site":"<domain>","url":"https://...","rating":"4.5/5","key_takeaway":"<one short clause>"}],"reviews_found":3,"domains_failed":[]}

Rules:
- domains_failed is ONLY for sites that could not be checked or returned no usable data. Do not put sites with zero matching reviews there if the site itself was reachable — just don't add a review_links entry for them.
- rating should be the site's own rating format as a string (e.g. "4.5/5", "8/10"), or null if the site gives no rating.
- reviews_found is the count of distinct reviews/sources that contributed to the summary, not the count of review_links entries.
- site must be the domain.
- summary is a maximum of two sentences, decision-oriented (does this product suit the user, not just "reviewers liked it"), and weighted toward the focus criteria above anything else. Paraphrase in your own words — do not reproduce review phrasing verbatim.
- key_takeaway is one short clause, not a full sentence.
- If no reviews are found on any site, summary should say so plainly (still within two sentences) and review_links should be empty.`,
        },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          allowed_domains: review_domains,
          allowed_callers: ["direct"],
          max_uses: Math.max(review_domains.length, 1),
        },
      ],
    });

    if (isDebugTools()) {
      console.log(JSON.stringify(response.content, null, 2));
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";

    const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/);
    if (!answerMatch) {
      console.log(text);
      parsed = {
        summary: "",
        review_links: [],
        reviews_found: 0,
        domains_failed: review_domains,
      };
    } else {
      try {
        parsed = JSON.parse(answerMatch[1].trim()) as AggregateReviewsResult;
      } catch (error) {
        console.error(error);
        parsed = {
          summary: "",
          review_links: [],
          reviews_found: 0,
          domains_failed: [],
        };
      }
    }
  }

  const domainHasResult = (domain: string) =>
    parsed.review_links.some(
      (r) =>
        r.site.toLowerCase() === domain.toLowerCase() ||
        r.url.toLowerCase().includes(domain.toLowerCase())
    );

  const result: AggregateReviewsResult = {
    summary: parsed.summary,
    review_links: parsed.review_links,
    reviews_found: parsed.reviews_found,
    domains_failed: review_domains.filter(
      (d: string) => !domainHasResult(d)
    ),
  };

  if (candidateId) {
    await writeReviewSnapshot(candidateId, result);
  }

  return NextResponse.json(result);
}
