-- A price_snapshots row must exist even when no retailer had a priced,
-- in-stock result (e.g. every domain was out of stock). Previously the
-- code worked around the not-null constraint by inserting a
-- "none_found" placeholder; now it inserts a real null price instead.
alter table price_snapshots alter column price drop not null;
