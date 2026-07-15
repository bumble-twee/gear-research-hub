-- Backstop for the enrich route's duplicate guard: input_name is what
-- the user typed and is how re-enrichment requests are matched, so two
-- candidates in the same search must never share one case-insensitively.
-- Manual candidates (input_name null) are unaffected — Postgres unique
-- indexes never treat two nulls as equal.
create unique index candidates_search_input_name_unique
  on candidates (search_id, lower(input_name));
