// For a single candidate, fetches each of its tracked_urls directly
// (plain HTTP, no Claude involved) and extracts current price + stock
// status: JSON-LD Product/Offer first, then Open Graph product tags,
// then a targeted price-pattern regex. Only if all three come up empty
// does it fall back to one small, cheap Claude call to parse the page
// text — never a web_search/web_fetch tool call, never a multi-turn
// loop. Cheap enough to run on every tracked candidate routinely.
//
// Writes one price_snapshot per successfully-parsed URL (append-only)
// through writeTrackedPriceSnapshotsAndCache — the same guardrail file
// that owns every other price write in this app — which also updates
// the candidate's current_price cache to the true cheapest in-stock
// price across all of them in one pass.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  writeTrackedPriceSnapshotsAndCache,
  type TrackedUrlResult,
} from "@/lib/db/writeSnapshotAndCache";
import mockParseAssist from "@/lib/fixtures/track-prices-parse-assist.json";
import { isMockMode } from "@/lib/env";

// Generous enough for a slow retailer page, short enough that one
// stuck URL can't stall the whole run indefinitely.
const FETCH_TIMEOUT_MS = 10_000;
const PARSE_ASSIST_TIMEOUT_MS = 20_000;
// Keeps the one-shot parse-assist call small and cheap regardless of
// page size.
const PARSE_ASSIST_MAX_CHARS = 12_000;

const anthropic = new Anthropic({ maxRetries: 0, timeout: PARSE_ASSIST_TIMEOUT_MS });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ExtractedPrice {
  price: number | null;
  currency: string;
  in_stock: boolean | null;
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

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// A result "succeeds" — and gets its own price_snapshot row — if it
// carries at least one usable signal. Both null means every
// extraction strategy came up empty; that's a parse failure, not a
// zero-value result.
function hasSignal(result: ExtractedPrice | null): result is ExtractedPrice {
  return result !== null && (result.price !== null || result.in_stock !== null);
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Many retailer sites block requests with no browser-like UA.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Walks a JSON-LD node looking for a Product with an Offer, including
// the common {"@graph": [...]} wrapper some sites use.
function findProductOfferInJsonLd(node: unknown): ExtractedPrice | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj["@graph"])) {
    for (const child of obj["@graph"] as unknown[]) {
      const found = findProductOfferInJsonLd(child);
      if (found) return found;
    }
  }

  const type = obj["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (!isProduct || !obj["offers"]) return null;

  const offerList = Array.isArray(obj["offers"]) ? obj["offers"] : [obj["offers"]];
  for (const offer of offerList) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as Record<string, unknown>;
    const rawPrice = o["price"] ?? o["lowPrice"];
    const price = rawPrice !== undefined ? parseFloat(String(rawPrice)) : NaN;
    const currency = typeof o["priceCurrency"] === "string" ? (o["priceCurrency"] as string) : "EUR";
    const availability = String(o["availability"] ?? "").toLowerCase();
    const inStock = availability
      ? availability.includes("instock")
        ? true
        : availability.includes("outofstock") || availability.includes("soldout")
          ? false
          : null
      : null;

    const result: ExtractedPrice = {
      price: Number.isNaN(price) ? null : price,
      currency,
      in_stock: inStock,
    };
    if (hasSignal(result)) return result;
  }
  return null;
}

function extractFromJsonLd(html: string): ExtractedPrice | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html))) {
    try {
      const json = JSON.parse(match[1].trim());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const found = findProductOfferInJsonLd(item);
        if (found) return found;
      }
    } catch {
      // Malformed JSON-LD block on this page — skip it, keep looking.
    }
  }
  return null;
}

function getMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

function extractFromOpenGraph(html: string): ExtractedPrice | null {
  const amount = getMetaContent(html, "product:price:amount") ?? getMetaContent(html, "og:price:amount");
  const currency =
    getMetaContent(html, "product:price:currency") ?? getMetaContent(html, "og:price:currency") ?? "EUR";
  const availability =
    getMetaContent(html, "product:availability") ?? getMetaContent(html, "og:availability");

  const price = amount ? parseFloat(amount.replace(",", ".")) : NaN;
  const inStock = availability
    ? /in\s*stock|instock/i.test(availability)
      ? true
      : /out\s*of\s*stock|outofstock|sold\s*out/i.test(availability)
        ? false
        : null
    : null;

  const result: ExtractedPrice = { price: Number.isNaN(price) ? null : price, currency, in_stock: inStock };
  return hasSignal(result) ? result : null;
}

function extractFromPricePattern(html: string): ExtractedPrice | null {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");

  let price: number | null = null;
  let currency = "EUR";
  const euroMatch = text.match(/(?:€|EUR)\s?(\d{1,4}(?:[.,]\d{2})?)|(\d{1,4}(?:[.,]\d{2}))\s?(?:€|EUR)/i);
  if (euroMatch) {
    price = parseFloat((euroMatch[1] ?? euroMatch[2]).replace(",", "."));
  } else {
    const dollarMatch = text.match(/\$\s?(\d{1,4}(?:[.,]\d{2})?)/);
    if (dollarMatch) {
      price = parseFloat(dollarMatch[1].replace(",", "."));
      currency = "USD";
    }
  }

  let inStock: boolean | null = null;
  if (/out of stock|sold out|currently unavailable/i.test(text)) {
    inStock = false;
  } else if (/in stock|add to (cart|basket|bag)/i.test(text)) {
    inStock = true;
  }

  const result: ExtractedPrice = { price, currency, in_stock: inStock };
  return hasSignal(result) ? result : null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ParseAssistSchema = z.object({
  price: z.number().nullable(),
  currency: z.string().nullable().optional(),
  in_stock: z.boolean().nullable(),
});

// The one place this route may spend an API call — a single-turn,
// no-tool completion over already-fetched page text. Never triggers a
// web search or a second turn.
async function parseAssistViaClaude(html: string, url: string): Promise<ExtractedPrice | null> {
  if (isMockMode()) {
    const mock = ParseAssistSchema.parse(mockParseAssist);
    const result: ExtractedPrice = { price: mock.price, currency: mock.currency ?? "EUR", in_stock: mock.in_stock };
    return hasSignal(result) ? result : null;
  }

  const text = htmlToText(html).slice(0, PARSE_ASSIST_MAX_CHARS);

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Extract the current price and stock status from this product page (${url}). If you cannot find a clear value, use null rather than guessing.

Wrap your answer in <answer></answer> tags containing only JSON matching: {"price": 99.99, "currency": "EUR", "in_stock": true}

Page text:
${text}`,
        },
      ],
    });
  } catch (error) {
    console.error(`[track-prices] parse-assist call failed for ${url}:`, errorMessage(error));
    return null;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const responseText = textBlock?.type === "text" ? textBlock.text : "";
  const match = responseText.match(/<answer>([\s\S]*?)<\/answer>/);
  if (!match) return null;

  try {
    const parsed = ParseAssistSchema.parse(JSON.parse(match[1].trim()));
    const result: ExtractedPrice = {
      price: parsed.price,
      currency: parsed.currency ?? "EUR",
      in_stock: parsed.in_stock,
    };
    return hasSignal(result) ? result : null;
  } catch (error) {
    console.error(`[track-prices] parse-assist response invalid for ${url}:`, error);
    return null;
  }
}

async function extractPriceFromUrl(url: string): Promise<ExtractedPrice | null> {
  const html = await fetchHtml(url);

  const structured =
    extractFromJsonLd(html) ?? extractFromOpenGraph(html) ?? extractFromPricePattern(html);
  if (structured) return structured;

  // Structured extraction found nothing — the only case that spends
  // an API call.
  return await parseAssistViaClaude(html, url);
}

export async function POST(req: NextRequest) {
  console.log(`[track-prices] mode: ${isMockMode() ? "MOCK" : "LIVE"}`);

  try {
    const { candidateId } = await req.json();
    if (!candidateId) {
      return NextResponse.json({ status: "error", error: "candidateId is required." }, { status: 400 });
    }

    const { data: candidate, error: candErr } = await supabase
      .from("candidates")
      .select("id, tracked_urls")
      .eq("id", candidateId)
      .single();
    if (candErr || !candidate) {
      return NextResponse.json(
        { status: "error", error: `Candidate ${candidateId} not found: ${candErr?.message}` },
        { status: 404 }
      );
    }

    const trackedUrls: string[] = Array.isArray(candidate.tracked_urls) ? candidate.tracked_urls : [];
    if (trackedUrls.length === 0) {
      return NextResponse.json({
        status: "completed",
        candidateId,
        results: [],
        domains_failed: [],
        note: "No tracked URLs on this candidate.",
      });
    }

    const capturedAt = new Date().toISOString();
    const results: TrackedUrlResult[] = [];
    const domainsFailed: string[] = [];

    for (const url of trackedUrls) {
      try {
        const extracted = await extractPriceFromUrl(url);
        if (extracted) {
          results.push({ url, retailer: hostnameOf(url), ...extracted });
        } else {
          domainsFailed.push(url);
        }
      } catch (error) {
        console.error(`[track-prices] failed for ${url}:`, errorMessage(error));
        domainsFailed.push(url);
      }
    }

    await writeTrackedPriceSnapshotsAndCache(candidateId, results, domainsFailed, capturedAt);

    return NextResponse.json({
      status: "completed",
      candidateId,
      results,
      domains_failed: domainsFailed,
    });
  } catch (error) {
    // Last-resort safety net: no matter what throws, the route must
    // still return a response instead of leaving the client hanging.
    console.error("Unhandled error in /api/track-prices:", error);
    return NextResponse.json({ status: "error", error: errorMessage(error) }, { status: 500 });
  }
}
