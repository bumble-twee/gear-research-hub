// The enrichment run. Takes a searchId + candidate names, runs the
// agent loop, validates output, writes to the database.
// The agent never touches Supabase. A bad run corrupts nothing.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ENRICHMENT_SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { findPricesTool, aggregateReviewsTool } from "@/lib/agent/tools";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { searchId, candidateNames } = await req.json();

  // TODO(cursor): load search spec + active preferred_sites from
  // Supabase, build the user message from them.

  // TODO(cursor): the agent loop.
  // 1. messages.create with system=ENRICHMENT_SYSTEM_PROMPT,
  //    tools=[findPricesTool, aggregateReviewsTool, web_search]
  // 2. While stop_reason === "tool_use": execute the requested tool
  //    by POSTing to /api/tools/* WITHOUT candidateId (candidates
  //    don't exist in the DB yet), append tool_result, continue.
  // 3. On final text response: JSON.parse, validate with zod against
  //    the output shape in prompt.ts. Reject the whole run on
  //    invalid JSON, do not partially write.
  // 4. Per candidate: insert candidates row, then call
  //    writePriceSnapshotAndCache + writeReviewSnapshot with the
  //    embedded tool results.
  // 5. Stream per-candidate progress to the client (SSE or polling a
  //    run_status field) so 8 candidates doesn't look like a hang.

  return NextResponse.json({ status: "not_implemented", searchId });
}
