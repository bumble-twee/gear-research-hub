@AGENTS.md

# Gear Research Hub — project status

## Build order status

Steps 1-5 of PLAN.md are done:

1. **Schema** — Supabase migration (`supabase/migrations/001_initial_schema.sql`, plus `002_nullable_snapshot_price.sql`) written and run.
2. **Seeding** — `preferred_sites` seeded with real retailer and review domains.
3. **find-prices** — `app/api/tools/find-prices/route.ts` implemented and tested.
4. **writeSnapshotAndCache** — `lib/db/writeSnapshotAndCache.ts` exists.
5. **aggregate-reviews** and the **enrich orchestrator loop** — `app/api/tools/aggregate-reviews/route.ts` and `app/api/enrich/route.ts` implemented: agent loop calls `find_prices`/`aggregate_reviews` as tools, output is zod-validated (whole run rejected on invalid JSON, no partial writes), candidates are written independently (one failing doesn't block the others). Tested end-to-end in mock mode; not yet run live.

Not yet built: the three UI views (searches list, search detail, new search form), CSV export.

Note: this project's actual file layout has no `src/` prefix — code lives under `app/` and `lib/` at the repo root, even though PLAN.md's structure diagram shows `src/app/...` and `src/lib/...`.

## Rules that must survive implementation

- Agent returns JSON; only application code writes the database.
- current_price fields are written ONLY by writeSnapshotAndCache,
  always together with a snapshot insert.
- Price and review refresh are independent; neither blocks the other.
- A requirement violation flags a candidate, never drops it (v1 is
  semi-manual; the user chose the candidate).
- SUPABASE_SERVICE_ROLE_KEY stays server-side. Never in client code.
- Never delete or modify database rows that were not created in the
  current session. Always ask before running any DELETE or other
  destructive SQL against Supabase.

## Reference implementation pattern

`app/api/tools/find-prices/route.ts` is the reference implementation pattern for tool routes (aggregate-reviews follows it). Key conventions it establishes:

- Answer-tag extraction from the model's response rather than free-form parsing — and from the LAST text block in the response, not the first, since `web_search` inserts tool_use/tool_result blocks (and sometimes preamble text) before the model's final answer.
- `domains_failed` is populated only for sites that were actually unreachable — not for sites that simply had no match.
- Out-of-stock items still go into `results`, marked with `in_stock: false` — they are not dropped or filtered out.
- Never write a placeholder-zero price. If a real price can't be found, omit it rather than fabricating `0`.

Known gap: `aggregate-reviews/route.ts` still reads the FIRST text block (not the last) when extracting the answer, unlike find-prices. Same root cause, not yet fixed there.

## Mock mode

Set `MOCK_TOOLS=true` in `.env.local` to skip the Anthropic API call in
all three routes (`find-prices`, `aggregate-reviews`, `enrich`) and use
the canned fixtures in `lib/fixtures/` instead (`find-prices.json`,
`aggregate-reviews.json`, `enrich-answer.json`). Every other line of
downstream logic — parsing, sorting, `domains_failed` computation, zod
validation, and all database writes — runs exactly as it would on a
live call; mock mode does not stub or skip DB writes, it only replaces
what the model would have returned.

`MOCK_TOOLS` and `DEBUG_TOOLS` (the latter gates a raw Claude-response
dump in the two tool routes) are read in exactly one place —
`lib/env.ts`'s `isMockMode()` / `isDebugTools()` — both requiring the
literal string `"true"`. Every route calls these helpers instead of
reading `process.env` directly. Each of the three routes logs its
resolved mode on every request (`[find-prices] mode: MOCK`, `[enrich]
mode: LIVE`, etc.) so the active mode is always visible in the
terminal.

**Tests default to mock mode. Live runs (real Anthropic calls, real
web search) are explicit** — set `MOCK_TOOLS` unset or `false` and say
so when asking for one, since it costs API credits and writes
real search results.

The enrich route wraps every per-candidate Supabase write in a 30s
timeout (`withTimeout` in `app/api/enrich/route.ts`) and the whole
handler in a top-level try/catch: a stalled connection can otherwise
leave `await` pending forever even after the write has already
committed server-side, and the route must always return a response.
