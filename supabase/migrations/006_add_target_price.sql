-- Optional user-set budget per candidate. Feeds the "Good deal" price
-- signal on the search detail page (computePriceStats in
-- app/searches/[id]/format.ts): current price at/below this counts as
-- a good deal even if it isn't the lowest ever seen. Null until set.
alter table candidates add column target_price numeric(10,2);
