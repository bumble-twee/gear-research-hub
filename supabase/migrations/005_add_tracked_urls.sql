-- Discovery-agent candidates (source 'agent', from /api/discover) start
-- with no confirmed retailer/product URLs at all — that's deliberate,
-- discovery never fetches prices or shops. tracked_urls is where those
-- get added later, by a future feature, once the user decides to chase
-- a lead down. Empty on insert either way.
alter table candidates add column tracked_urls jsonb not null default '[]';
