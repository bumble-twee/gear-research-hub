// The enrichment run. Takes a searchId + candidate names, runs the
// agent loop, validates output, writes to the database.
// The agent never touches Supabase. A bad run corrupts nothing.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { createClient } from "@supabase/supabase-js";
import { ENRICHMENT_SYSTEM_PROMPT, EnrichmentOutputSchema } from "@/lib/agent/prompt";
import { findPricesTool, aggregateReviewsTool } from "@/lib/agent/tools";
import {
  writePriceSnapshotAndCache,
  writeReviewSnapshot,
} from "@/lib/db/writeSnapshotAndCache";
import mockEnrichAnswer from "@/lib/fixtures/enrich-answer.json";

const anthropic = new Anthropic();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// The agent's own tool_use loop (find_prices / aggregate_reviews), not
// to be confused with the server-side web_search pause_turn loop that
// lives inside those two tool routes.
const MAX_TURNS = 20;

export async function POST(req: NextRequest) {
  const { searchId, candidateNames } = await req.json();

  let output: unknown;
  if (process.env.MOCK_TOOLS === "true") {
    console.log("MOCK MODE");
    output = mockEnrichAnswer;
  } else {
    output = await runAgentLoop(req, searchId, candidateNames);
  }

  const parsedOutput = EnrichmentOutputSchema.safeParse(output);
  if (!parsedOutput.success) {
    console.error(parsedOutput.error);
    return NextResponse.json(
      {
        status: "rejected",
        searchId,
        error: "Agent output failed validation; no candidates written.",
        issues: parsedOutput.error.issues,
      },
      { status: 422 }
    );
  }

  // Process candidates independently: one candidate's write failure
  // must not stop the others.
  const results: {
    input_name: string;
    candidateId?: string;
    error?: string;
  }[] = [];

  for (const candidate of parsedOutput.data.candidates) {
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from("candidates")
        .insert({
          search_id: searchId,
          brand: candidate.resolved.brand,
          name: candidate.resolved.name,
          brand_url: candidate.resolved.brand_url,
          image_url: candidate.resolved.image_url,
          size: candidate.specs.size,
          weight_grams: candidate.specs.weight_grams,
          gender: candidate.specs.gender,
          features: candidate.specs.features,
          source: "agent",
          input_name: candidate.input_name,
          requirement_violations: candidate.requirement_violations,
          needs_verification: candidate.needs_verification,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      // Price and review writes are independent; neither blocks the other.
      const [priceOutcome, reviewOutcome] = await Promise.allSettled([
        writePriceSnapshotAndCache(inserted.id, candidate.price_result),
        writeReviewSnapshot(inserted.id, candidate.review_result),
      ]);
      const writeErrors = [priceOutcome, reviewOutcome]
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => String(r.reason));

      results.push({
        input_name: candidate.input_name,
        candidateId: inserted.id,
        ...(writeErrors.length > 0 && { error: writeErrors.join("; ") }),
      });
    } catch (error) {
      console.error(`Candidate "${candidate.input_name}" failed:`, error);
      results.push({ input_name: candidate.input_name, error: String(error) });
    }
  }

  return NextResponse.json({
    status: "completed",
    searchId,
    candidates: results,
    run_notes: parsedOutput.data.run_notes,
  });
}

async function runAgentLoop(
  req: NextRequest,
  searchId: string,
  candidateNames: string[]
): Promise<unknown> {
  const { data: search, error: searchErr } = await supabase
    .from("searches")
    .select("*")
    .eq("id", searchId)
    .single();
  if (searchErr || !search) {
    throw new Error(`Search ${searchId} not found: ${searchErr?.message}`);
  }

  let referenceItemText = search.reference_item ?? "none specified";
  if (search.replaces_item_id) {
    const { data: ownedItem } = await supabase
      .from("owned_items")
      .select("brand, name, category, notes")
      .eq("id", search.replaces_item_id)
      .single();
    if (ownedItem) {
      referenceItemText = `Replacing: ${ownedItem.brand} ${ownedItem.name} (${ownedItem.category})${
        ownedItem.notes ? ` — ${ownedItem.notes}` : ""
      }`;
    }
  }

  const { data: sites, error: sitesErr } = await supabase
    .from("preferred_sites")
    .select("site_type, domain, priority")
    .eq("active", true)
    .order("priority", { ascending: true });
  if (sitesErr) throw sitesErr;

  const retailerDomains = (sites ?? [])
    .filter((s) => s.site_type === "retailer")
    .map((s) => s.domain);
  const reviewDomains = (sites ?? [])
    .filter((s) => s.site_type === "review")
    .map((s) => s.domain);

  const userMessage = `Research the following candidates for this search.

Search: ${search.title}
Category: ${search.category}
Reference item: ${referenceItemText}
Required features: ${JSON.stringify(search.required_features)}
Priorities, in order: ${JSON.stringify(search.priorities)}
Size to research: ${search.size ?? "not specified"}
Gender: ${search.gender ?? "not specified"}

Candidates to research: ${candidateNames.join(", ")}

When calling find_prices, use these retailer domains: ${
    retailerDomains.join(", ") || "none configured"
  }.
When calling aggregate_reviews, use these review domains: ${
    reviewDomains.join(", ") || "none configured"
  }.`;

  const params = {
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: ENRICHMENT_SYSTEM_PROMPT,
    tools: [findPricesTool, aggregateReviewsTool],
  };

  let messages: MessageParam[] = [{ role: "user", content: userMessage }];
  let response = await anthropic.messages.create({ ...params, messages });

  let turns = 0;
  while (response.stop_reason === "tool_use" && turns < MAX_TURNS) {
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const toolResults: ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(req, block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults },
    ];
    response = await anthropic.messages.create({ ...params, messages });
    turns++;
  }

  const textBlocks = response.content.filter((b) => b.type === "text");
  const textBlock = textBlocks[textBlocks.length - 1];
  const text = textBlock?.type === "text" ? textBlock.text : "";

  // Prompt asks for raw JSON, no prose, but strip accidental code
  // fences defensively before parsing.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");

  return JSON.parse(cleaned);
}

async function executeTool(req: NextRequest, name: string, input: unknown) {
  // Candidates don't exist in the DB yet at this point in the run, so
  // no candidateId is passed — these calls never trigger a snapshot
  // write. That happens later, once this route validates the full
  // output and inserts each candidate.
  const path =
    name === "find_prices"
      ? "/api/tools/find-prices"
      : "/api/tools/aggregate-reviews";
  const res = await fetch(new URL(path, req.nextUrl.origin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}
