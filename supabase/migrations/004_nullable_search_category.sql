-- The new-search form and search detail header no longer collect or
-- display category; enrichment context now comes from the search
-- title instead. Column stays for future use, just no longer required.
alter table searches alter column category drop not null;
