@AGENTS.md

# Gear Research Hub — project status

## Build order status

Steps 1-4 of PLAN.md are done:

1. **Schema** — Supabase migration (`supabase/migrations/001_initial_schema.sql`) written and run.
2. **Seeding** — `preferred_sites` seeded with real retailer and review domains.
3. **find-prices** — `src/app/api/tools/find-prices/route.ts` implemented and tested.
4. **writeSnapshotAndCache** — `src/lib/db/writeSnapshotAndCache.ts` exists.

Not yet built: aggregate-reviews route, enrich orchestrator loop, the three UI views (searches list, search detail, new search form), CSV export.

## Rules that must survive implementation

- Agent returns JSON; only application code writes the database.
- current_price fields are written ONLY by writeSnapshotAndCache,
  always together with a snapshot insert.
- Price and review refresh are independent; neither blocks the other.
- A requirement violation flags a candidate, never drops it (v1 is
  semi-manual; the user chose the candidate).
- SUPABASE_SERVICE_ROLE_KEY stays server-side. Never in client code.

## Reference implementation pattern

`src/app/api/tools/find-prices/route.ts` is the reference implementation pattern for tool routes (e.g. aggregate-reviews should follow it). Key conventions it establishes:

- Answer-tag extraction from the model's response rather than free-form parsing.
- `domains_failed` is populated only for sites that were actually unreachable — not for sites that simply had no match.
- Out-of-stock items still go into `results`, marked with `in_stock: false` — they are not dropped or filtered out.
- Never write a placeholder-zero price. If a real price can't be found, omit it rather than fabricating `0`.
