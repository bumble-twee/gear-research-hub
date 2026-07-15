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
import { isMockMode } from "@/lib/env";

// maxRetries: 0 and an explicit timeout so a stalled or failing call
// surfaces immediately as a thrown error instead of retrying silently.
const anthropic = new Anthropic({ maxRetries: 0, timeout: 300_000 });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// The agent's own tool_use loop (find_prices / aggregate_reviews), not
// to be confused with the server-side web_search pause_turn loop that
// lives inside those two tool routes.
const MAX_TURNS = 15;

// A stalled Supabase call (dropped connection, hung keep-alive socket)
// never rejects on its own — it just never resolves, even though the
// write may have already committed server-side. Without a timeout,
// `await` on that call would hang the request forever. Race every DB
// operation against this so the route always returns a response.
const DB_OP_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${DB_OP_TIMEOUT_MS}ms`)),
      DB_OP_TIMEOUT_MS
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

const BRAND_URL_CHECK_TIMEOUT_MS = 5_000;

// The agent can hallucinate a plausible-looking brand URL even when
// told not to. A HEAD request is a cheap, real-world check that the
// URL actually resolves before it's ever written to the database.
async function verifyBrandUrl(
  url: string
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRAND_URL_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    const ok = res.status >= 200 && res.status < 400;
    return { ok, detail: `status ${res.status}` };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

// runAgentLoop never throws for an aborted run — it reports the abort
// so the caller can respond without touching the database. Only a
// successful run reaches candidate validation and writes.
type AgentLoopResult =
  | { ok: true; output: unknown }
  | {
      ok: false;
      reason: "max_iterations" | "api_error" | "invalid_answer";
      error: string;
      completed: string[];
    };

export async function POST(req: NextRequest) {
  const mockMode = isMockMode();
  console.log(`[enrich] mode: ${mockMode ? "MOCK" : "LIVE"}`);

  try {
    const { searchId, candidateNames } = await req.json();

    let output: unknown;
    if (mockMode) {
      // Mirror a live run's shape: only the requested candidates come
      // back, not the whole fixture regardless of what was asked for.
      const fixtureCandidates = mockEnrichAnswer.candidates;
      const matched = fixtureCandidates.filter((c) =>
        candidateNames.includes(c.input_name)
      );
      const missing = candidateNames.filter(
        (name: string) => !fixtureCandidates.some((c) => c.input_name === name)
      );
      if (missing.length > 0) {
        console.warn(
          `[enrich] MOCK MODE: requested candidate name(s) not present in fixture, skipping: ${missing.join(", ")}`
        );
      }
      output = { ...mockEnrichAnswer, candidates: matched };
    } else {
      const loopResult = await runAgentLoop(req, searchId, candidateNames);
      if (!loopResult.ok) {
        console.error(`Agent loop aborted (${loopResult.reason}):`, loopResult.error);
        return NextResponse.json(
          {
            status: "aborted",
            searchId,
            reason: loopResult.reason,
            error: loopResult.error,
            completed: loopResult.completed,
          },
          { status: loopResult.reason === "invalid_answer" ? 500 : 502 }
        );
      }
      output = loopResult.output;
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

    // Verify each candidate's brand_url before it ever reaches the
    // database — independent per candidate, checked in parallel.
    const verifiedCandidates = await Promise.all(
      parsedOutput.data.candidates.map(async (candidate) => {
        const url = candidate.resolved.brand_url;
        if (!url) {
          return candidate;
        }
        const { ok, detail } = await verifyBrandUrl(url);
        console.log(
          `[enrich] brand_url check ${ok ? "OK" : "FAILED"} (${detail}): ${url}`
        );
        if (ok) {
          return candidate;
        }
        return {
          ...candidate,
          resolved: { ...candidate.resolved, brand_url: null },
          needs_verification: [
            ...candidate.needs_verification,
            { field: "brand_url", note: `brand_url failed verification: ${url}` },
          ],
        };
      })
    );

    // Process candidates independently: one candidate's write failure
    // must not stop the others.
    const results: {
      input_name: string;
      candidateId?: string;
      error?: string;
    }[] = [];

    for (const candidate of verifiedCandidates) {
      try {
        const { data: inserted, error: insertErr } = await withTimeout(
          supabase
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
            .single(),
          `insert candidate "${candidate.input_name}"`
        );
        if (insertErr) throw insertErr;

        // Price and review writes are independent; neither blocks the other.
        const [priceOutcome, reviewOutcome] = await Promise.allSettled([
          withTimeout(
            writePriceSnapshotAndCache(inserted.id, candidate.price_result),
            `price write for "${candidate.input_name}"`
          ),
          withTimeout(
            writeReviewSnapshot(inserted.id, candidate.review_result),
            `review write for "${candidate.input_name}"`
          ),
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
  } catch (error) {
    // Last-resort safety net: no matter what throws (bad request body,
    // an unexpected exception in runAgentLoop's setup queries, etc.),
    // the route must still return a response instead of leaving the
    // client hanging.
    console.error("Unhandled error in /api/enrich:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function runAgentLoop(
  req: NextRequest,
  searchId: string,
  candidateNames: string[]
): Promise<AgentLoopResult> {
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
  const completed: string[] = [];

  const logBeforeCall = (iteration: number) => {
    const inputSize = JSON.stringify(messages).length;
    console.log(
      `[enrich] ${new Date().toISOString()} iteration ${iteration}: sending messages.create (~${inputSize} chars input)`
    );
  };
  const logAfterCall = (iteration: number, res: Anthropic.Messages.Message) => {
    console.log(
      `[enrich] ${new Date().toISOString()} iteration ${iteration}: stop_reason=${res.stop_reason} input_tokens=${res.usage?.input_tokens} output_tokens=${res.usage?.output_tokens}`
    );
  };

  // Any Anthropic API error (rate limit, insufficient credit, timeout,
  // etc.) aborts the run immediately — never retried silently.
  let response;
  logBeforeCall(0);
  try {
    response = await anthropic.messages.create({ ...params, messages });
  } catch (error) {
    return {
      ok: false,
      reason: "api_error",
      error: error instanceof Error ? error.message : String(error),
      completed,
    };
  }
  logAfterCall(0, response);

  let turns = 0;
  while (response.stop_reason === "tool_use" || response.stop_reason === "pause_turn") {
    if (turns >= MAX_TURNS) {
      return {
        ok: false,
        reason: "max_iterations",
        error: `Agent loop hit the ${MAX_TURNS}-iteration cap without producing a final answer.`,
        completed,
      };
    }
    turns++;

    if (response.stop_reason === "pause_turn") {
      console.log(`[enrich] iteration ${turns}: pause_turn, continuing`);
      messages = [...messages, { role: "assistant", content: response.content }];
    } else {
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults: ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        console.log(`[enrich] iteration ${turns}: calling ${block.name}`);
        const result = await executeTool(req, block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
        completed.push(`${block.name}(${JSON.stringify(block.input)})`);
      }
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    }

    logBeforeCall(turns);
    try {
      response = await anthropic.messages.create({ ...params, messages });
    } catch (error) {
      return {
        ok: false,
        reason: "api_error",
        error: error instanceof Error ? error.message : String(error),
        completed,
      };
    }
    logAfterCall(turns, response);
  }

  // Same pattern as find-prices: the LAST text block, not the first,
  // since tool use may insert blocks (and preamble text) before the
  // model's final answer.
  const textBlocks = response.content.filter((b) => b.type === "text");
  const textBlock = textBlocks[textBlocks.length - 1];
  const text = textBlock?.type === "text" ? textBlock.text : "";

  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/);
  if (!answerMatch) {
    return {
      ok: false,
      reason: "invalid_answer",
      error: `No <answer> tags found in the model's response. First 500 chars: ${text.slice(0, 500)}`,
      completed,
    };
  }

  try {
    return { ok: true, output: JSON.parse(answerMatch[1].trim()) };
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_answer",
      error: `Failed to parse JSON inside <answer> tags (${
        error instanceof Error ? error.message : String(error)
      }). First 500 chars of response: ${text.slice(0, 500)}`,
      completed,
    };
  }
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
