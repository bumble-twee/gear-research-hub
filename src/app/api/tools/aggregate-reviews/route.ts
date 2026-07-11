// Standalone tool, same two-caller pattern as find-prices.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { writeReviewSnapshot } from "@/lib/db/writeSnapshotAndCache";
import type { AggregateReviewsResult } from "@/lib/agent/tools";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { brand, item_name, review_domains, focus_criteria, candidateId } =
    await req.json();

  // TODO(cursor): implement with a single Claude call using web_search
  // over review_domains. The summarization prompt must weight
  // focus_criteria (e.g. weight, durability) so the summary is written
  // for THIS user's decision. Return AggregateReviewsResult JSON.
  const result: AggregateReviewsResult = {
    summary: "",
    review_links: [],
    reviews_found: 0,
    domains_failed: review_domains,
  };

  if (candidateId) {
    await writeReviewSnapshot(candidateId, result);
  }

  return NextResponse.json(result);
}
