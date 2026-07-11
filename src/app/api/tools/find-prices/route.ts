// Standalone tool. Two callers:
// 1. The orchestrator during a full enrichment run
// 2. The UI's per-candidate "Refresh price" button (with candidateId
//    set, which triggers the snapshot+cache write)

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { writePriceSnapshotAndCache } from "@/lib/db/writeSnapshotAndCache";
import type { FindPricesResult } from "@/lib/agent/tools";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { brand, item_name, size, retailer_domains, candidateId } =
    await req.json();

  // TODO(cursor): implement with a single Claude call using web_search,
  // constrained to retailer_domains. Prompt it to return the
  // FindPricesResult JSON shape. Record failed domains rather than
  // omitting them. Keep this function under ~80 lines.
  const result: FindPricesResult = {
    results: [],
    searched_at: new Date().toISOString(),
    domains_failed: retailer_domains,
  };

  // Direct UI refresh path: persist immediately.
  // Orchestrator path passes no candidateId; it persists after
  // validating the full run output.
  if (candidateId) {
    await writePriceSnapshotAndCache(candidateId, result);
  }

  return NextResponse.json(result);
}
