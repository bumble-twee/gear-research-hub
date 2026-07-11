# Gear Research Hub — v1 build plan

## Structure

```
supabase/migrations/001_initial_schema.sql   full schema, run first
src/lib/agent/prompt.ts                      enrichment system prompt
src/lib/agent/tools.ts                       tool defs + result types
src/lib/db/writeSnapshotAndCache.ts          the ONLY writer of snapshots
                                             and the price cache
src/app/api/tools/find-prices/route.ts       tool, callable by agent + UI
src/app/api/tools/aggregate-reviews/route.ts tool, callable by agent + UI
src/app/api/enrich/route.ts                  orchestrator run
```

Not scaffolded yet (build after the data path works): the three UI
views (searches list, search detail, new search form) and CSV export.

## Build order

1. **Supabase project + run the migration.** Seed preferred_sites with
   real retailer and review domains. Verify in the table editor.
2. **find-prices route, for real.** One Claude call with web_search.
   Test it standalone with curl against one boot you know the price
   of. Get this solid before anything else — it's the flakiest part.
3. **aggregate-reviews route.** Same pattern, test standalone.
4. **writeSnapshotAndCache.** Wire the candidateId path, confirm a
   refresh writes BOTH the snapshot row and the cache fields.
5. **The enrich orchestrator loop.** Test with 2 candidates, not 8.
6. **Search detail UI.** Cards per the mockup: status badge, fit dots,
   current price + age, staleness warning, per-card refresh buttons,
   collapsed rejected rows, cascading sort (fit desc, weight asc,
   price asc; null fit sorts last when fit leads).
7. **Searches list + new search form.** Plain CRUD.
8. **CSV export.** One route, one button. Durability insurance.

## Rules that must survive implementation

- Agent returns JSON; only application code writes the database.
- current_price fields are written ONLY by writeSnapshotAndCache,
  always together with a snapshot insert.
- Price and review refresh are independent; neither blocks the other.
- A requirement violation flags a candidate, never drops it (v1 is
  semi-manual; the user chose the candidate).
- SUPABASE_SERVICE_ROLE_KEY stays server-side. Never in client code.

## Env vars

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```
