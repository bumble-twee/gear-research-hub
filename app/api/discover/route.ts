// Discovery: given a search's need description alone (no candidate
// names), proposes 4-8 real candidate product lines and writes them
// as candidates rows. Distinct from /api/enrich, which researches
// specs/price for candidates the user has already named — discovery
// never fetches prices, confirms stock, or invents a variant number.
// The agent never touches Supabase; a bad run corrupts nothing.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { createClient } from "@supabase/supabase-js";
import { DISCOVERY_SYSTEM_PROMPT, DiscoveryOutputSchema } from "@/lib/agent/discoveryPrompt";
import mockDiscoverAnswer from "@/lib/fixtures/discover-answer.json";
import { isMockMode, isDebugTools } from "@/lib/env";
import { normalizeRequiredFeatures } from "@/app/searches/[id]/format";

// Vercel function ceiling on the Hobby plan; the route can't run longer
// than this regardless of what's still in flight.
export const maxDuration = 300;

const anthropic = new Anthropic({ maxRetries: 0, timeout: 120_000 });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// web_search is a server-side tool: a single API call can pause mid-turn
// (stop_reason "pause_turn") for a long-running search and expects the
// caller to send the response back as-is to let the model continue.
// Higher than find-prices' 5 since one discovery run grounds several
// distinct candidates in a single pass.
const MAX_CONTINUATIONS = 8;

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

// Supabase's PostgrestError doesn't extend Error, so String(error) on
// it gives "[object Object]" instead of its actual message.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

type DiscoveryLoopResult =
  | { ok: true; output: unknown }
  | {
      ok: false;
      reason: "api_error" | "invalid_answer";
      error: string;
    };

export async function POST(req: NextRequest) {
  const mockMode = isMockMode();
  console.log(`[discover] mode: ${mockMode ? "MOCK" : "LIVE"}`);

  try {
    const { searchId } = await req.json();
    if (!searchId) {
      return NextResponse.json(
        { status: "error", error: "searchId is required." },
        { status: 400 }
      );
    }

    const { data: search, error: searchErr } = await supabase
      .from("searches")
      .select("*")
      .eq("id", searchId)
      .single();
    if (searchErr || !search) {
      return NextResponse.json(
        { status: "error", error: `Search ${searchId} not found: ${searchErr?.message}` },
        { status: 404 }
      );
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

    let output: unknown;
    if (mockMode) {
      output = mockDiscoverAnswer;
    } else {
      const loopResult = await runDiscoveryLoop(search, referenceItemText);
      if (!loopResult.ok) {
        console.error(`Discovery loop aborted (${loopResult.reason}):`, loopResult.error);
        return NextResponse.json(
          { status: "aborted", searchId, reason: loopResult.reason, error: loopResult.error },
          { status: loopResult.reason === "invalid_answer" ? 500 : 502 }
        );
      }
      output = loopResult.output;
    }

    const parsedOutput = DiscoveryOutputSchema.safeParse(output);
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
      brand: string;
      product_line_name: string;
      candidateId?: string;
      error?: string;
    }[] = [];

    for (const candidate of parsedOutput.data.candidates) {
      try {
        const { data: inserted, error: insertErr } = await withTimeout(
          supabase
            .from("candidates")
            .insert({
              search_id: searchId,
              brand: candidate.brand,
              name: candidate.product_line_name,
              size: candidate.approximate_capacity_or_size,
              source: "agent",
              status: "considering",
              tracked_urls: [],
              features: {
                why_it_fits: candidate.why_it_fits,
                how_it_falls_short: candidate.how_it_falls_short,
              },
            })
            .select()
            .single(),
          `insert discovered candidate "${candidate.brand} ${candidate.product_line_name}"`
        );
        if (insertErr) throw insertErr;
        results.push({
          brand: candidate.brand,
          product_line_name: candidate.product_line_name,
          candidateId: inserted.id,
        });
      } catch (error) {
        console.error(
          `Discovered candidate "${candidate.brand} ${candidate.product_line_name}" failed:`,
          error
        );
        results.push({
          brand: candidate.brand,
          product_line_name: candidate.product_line_name,
          error: errorMessage(error),
        });
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
    // an unexpected exception in setup queries, etc.), the route must
    // still return a response instead of leaving the client hanging.
    console.error("Unhandled error in /api/discover:", error);
    return NextResponse.json(
      { status: "error", error: errorMessage(error) },
      { status: 500 }
    );
  }
}

interface DiscoverySearchSpec {
  title: string;
  required_features: unknown;
  priorities: string[];
  size: string | null;
  gender: string | null;
}

async function runDiscoveryLoop(
  search: DiscoverySearchSpec,
  referenceItemText: string
): Promise<DiscoveryLoopResult> {
  const userMessage = `Propose candidate products for this search.

Search: ${search.title}
Reference item: ${referenceItemText}
Required features: ${JSON.stringify(normalizeRequiredFeatures(search.required_features))}
Priorities, in order: ${JSON.stringify(search.priorities)}
Approximate size to target: ${search.size ?? "not specified"}
Gender: ${search.gender ?? "not specified"}`;

  const params = {
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: DISCOVERY_SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305" as const,
        name: "web_search" as const,
        // Unrestricted: discovery searches the open web for real
        // product lines, not just this search's preferred_sites.
        allowed_callers: ["direct" as const],
        max_uses: 20,
      },
    ],
  };

  let messages: MessageParam[] = [{ role: "user", content: userMessage }];

  let response;
  try {
    response = await anthropic.messages.create({ ...params, messages });
  } catch (error) {
    return {
      ok: false,
      reason: "api_error",
      error: errorMessage(error),
    };
  }

  let continuations = 0;
  while (response.stop_reason === "pause_turn" && continuations < MAX_CONTINUATIONS) {
    messages = [...messages, { role: "assistant", content: response.content }];
    try {
      response = await anthropic.messages.create({ ...params, messages });
    } catch (error) {
      return {
        ok: false,
        reason: "api_error",
        error: errorMessage(error),
      };
    }
    continuations++;
  }

  if (isDebugTools()) {
    console.log(JSON.stringify(response.content, null, 2));
  }

  // Same pattern as find-prices: the LAST text block, not the first,
  // since web_search inserts tool_use/tool_result blocks (and
  // sometimes preamble text) before the model's final answer.
  const textBlocks = response.content.filter((b) => b.type === "text");
  const textBlock = textBlocks[textBlocks.length - 1];
  const text = textBlock?.type === "text" ? textBlock.text : "";

  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/);
  if (!answerMatch) {
    return {
      ok: false,
      reason: "invalid_answer",
      error: `No <answer> tags found in the model's response. First 500 chars: ${text.slice(0, 500)}`,
    };
  }

  try {
    return { ok: true, output: JSON.parse(answerMatch[1].trim()) };
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_answer",
      error: `Failed to parse JSON inside <answer> tags (${
        errorMessage(error)
      }). First 500 chars of response: ${text.slice(0, 500)}`,
    };
  }
}
