-- Gear Research Hub, v1 schema
-- Run in Supabase SQL editor or via supabase db push

-- Seed of the future gear library. Minimal on purpose.
create table owned_items (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  name text not null,
  category text not null,
  purchased_at date,
  purchase_price numeric(10,2),
  currency text default 'EUR',
  retired_at date, -- null while still in use
  notes text,
  created_at timestamptz not null default now()
);

create table searches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  replaces_item_id uuid references owned_items(id), -- nullable
  reference_item text, -- free text when not replacing an owned item
  required_features jsonb not null default '{}', -- hard requirements, per-category shape
  priorities jsonb not null default '[]', -- ordered soft preferences
  size text,
  gender text,
  status text not null default 'active'
    check (status in ('active', 'decided', 'abandoned')),
  chosen_candidate_id uuid, -- FK added below after candidates exists
  decision_notes text,
  created_at timestamptz not null default now()
);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references searches(id) on delete cascade,
  brand text not null,
  name text not null,
  brand_url text,
  image_url text, -- og:image hotlink, may rot, acceptable
  size text,
  weight_grams int,
  gender text,
  features jsonb not null default '{}',
  status text not null default 'considering'
    check (status in ('considering', 'shortlisted', 'rejected', 'chosen')),
  rejection_reason text,
  source text not null default 'manual'
    check (source in ('manual', 'agent')),
  input_name text, -- what the user typed, to verify agent resolution
  requirement_violations jsonb not null default '[]',
  needs_verification jsonb not null default '[]',
  -- Fit tracking. Separate dimension from status.
  fit_rating int check (fit_rating between 1 and 5),
  fit_notes text,
  tried_on_at date,
  -- Current price cache. Scoreboard, not source of truth.
  -- ONLY written by writeSnapshotAndCache, never independently.
  current_price numeric(10,2),
  current_price_currency text,
  current_price_retailer text,
  current_price_url text,
  price_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table searches
  add constraint fk_chosen_candidate
  foreign key (chosen_candidate_id) references candidates(id);

-- Append-only. The judges' sheets.
create table price_snapshots (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  price numeric(10,2) not null,
  currency text not null default 'EUR',
  retailer text not null,
  url text,
  in_stock boolean,
  size_matched boolean,
  domains_failed jsonb not null default '[]',
  captured_at timestamptz not null default now()
);

-- Append-only.
create table review_snapshots (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  summary text,
  review_links jsonb not null default '[]', -- [{site, url, rating, key_takeaway}]
  reviews_found int,
  domains_failed jsonb not null default '[]',
  captured_at timestamptz not null default now()
);

-- Agent config as data, not code.
create table preferred_sites (
  id uuid primary key default gen_random_uuid(),
  site_type text not null check (site_type in ('retailer', 'review')),
  domain text not null unique,
  priority int not null default 100,
  active boolean not null default true
);

create index idx_candidates_search on candidates(search_id);
create index idx_price_snapshots_candidate on price_snapshots(candidate_id, captured_at desc);
create index idx_review_snapshots_candidate on review_snapshots(candidate_id, captured_at desc);

-- Seed your real sites before first run. Examples:
-- insert into preferred_sites (site_type, domain, priority) values
--   ('retailer', 'snowleader.com', 10),
--   ('retailer', 'glisshop.com', 20),
--   ('retailer', 'hardloop.fr', 30),
--   ('review', 'outdoorgearlab.com', 10),
--   ('review', 'blisterreview.com', 20);
