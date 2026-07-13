// Standalone tool. Two callers:
// 1. The orchestrator during a full enrichment run
// 2. The UI's per-candidate "Refresh price" button (with candidateId
//    set, which triggers the snapshot+cache write)

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { writePriceSnapshotAndCache } from "@/lib/db/writeSnapshotAndCache";
import type { FindPricesResult } from "@/lib/agent/tools";

const anthropic = new Anthropic();

// web_search is a server-side tool: a single API call can pause mid-turn
// (stop_reason "pause_turn") for a long-running search and expects the
// caller to send the response back as-is to let the model continue.
const MAX_CONTINUATIONS = 5;

export async function POST(req: NextRequest) {
  const { brand, item_name, size, retailer_domains, candidateId } =
    await req.json();

  const searched_at = new Date().toISOString();
  const sizeClause = size ? ` size "${size}"` : "";

  const params = {
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305" as const,
        name: "web_search" as const,
        allowed_domains: retailer_domains,
        allowed_callers: ["direct" as const],
        max_uses: Math.max(retailer_domains.length, 1),
      },
    ],
  };

  let messages: MessageParam[] = [
    {
      role: "user",
      content: `Find current prices for ${brand} ${item_name}${sizeClause} on each retailer domain: ${retailer_domains.join(", ")}.

Search every listed domain. Output your final answer as JSON wrapped in <answer></answer> tags, with no other text inside the tags.

The JSON must match:
{"results":[{"retailer":"<domain>","price":99.99,"currency":"EUR","url":"https://...","in_stock":true,"size_matched":true},{"retailer":"<domain>","currency":"EUR","url":"https://...","in_stock":false,"size_matched":true}],"searched_at":"${searched_at}","domains_failed":[]}

Rules:
- domains_failed is ONLY for sites that could not be checked or returned no usable data. Do not put out-of-stock products there.
- Out-of-stock products go in results with in_stock false and the price field omitted.
- Never output 0 as a placeholder price.
- Sort results cheapest first among in-stock items (out-of-stock items after in-stock).
- retailer must be the domain.`,
    },
  ];

  let response = await anthropic.messages.create({ ...params, messages });

  let continuations = 0;
  while (
    response.stop_reason === "pause_turn" &&
    continuations < MAX_CONTINUATIONS
  ) {
    messages = [
      ...messages,
      { role: "assistant", content: response.content },
    ];
    response = await anthropic.messages.create({ ...params, messages });
    continuations++;
  }

  console.log(JSON.stringify(response.content, null, 2));

  // web_search inserts tool_use/tool_result blocks before the model's
  // final answer, and may also emit preamble text blocks (e.g. "I'll
  // search now") before those. The <answer> tags are only ever in the
  // LAST text block, never the first.
  const textBlocks = response.content.filter((b) => b.type === "text");
  const textBlock = textBlocks[textBlocks.length - 1];
  const text = textBlock?.type === "text" ? textBlock.text : "";

  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/);
  if (!answerMatch) {
    console.log(text);
    const result: FindPricesResult = {
      results: [],
      searched_at,
      domains_failed: retailer_domains,
    };
    if (candidateId) {
      await writePriceSnapshotAndCache(candidateId, result);
    }
    return NextResponse.json(result);
  }

  let parsed: FindPricesResult;
  try {
    parsed = JSON.parse(answerMatch[1].trim()) as FindPricesResult;
  } catch (error) {
    console.error(error);
    parsed = { results: [], searched_at, domains_failed: [] };
  }

  const domainHasResult = (domain: string) =>
    parsed.results.some(
      (r) =>
        r.retailer.toLowerCase() === domain.toLowerCase() ||
        r.url.toLowerCase().includes(domain.toLowerCase())
    );

  // Priced-and-in-stock results sort cheapest first; anything without a
  // usable price (out-of-stock, price omitted) sorts after them instead
  // of corrupting the comparator with NaN.
  const isPriced = (r: FindPricesResult["results"][number]) =>
    r.in_stock && typeof r.price === "number";

  const result: FindPricesResult = {
    results: [...parsed.results].sort((a, b) => {
      const aPriced = isPriced(a);
      const bPriced = isPriced(b);
      if (aPriced && bPriced) return a.price! - b.price!;
      if (aPriced) return -1;
      if (bPriced) return 1;
      return 0;
    }),
    searched_at,
    domains_failed: retailer_domains.filter(
      (d: string) => !domainHasResult(d)
    ),
  };

  // Direct UI refresh path: persist immediately.
  // Orchestrator path passes no candidateId; it persists after
  // validating the full run output.
  if (candidateId) {
    await writePriceSnapshotAndCache(candidateId, result);
  }

  return NextResponse.json(result);
}
