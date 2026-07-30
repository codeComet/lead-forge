-- Per-org choice of which AI provider generates demo websites.
-- NULL = "auto" (the worker uses the first provider with an API key set).
-- Not constrained to a fixed list here so new providers don't need a migration;
-- the app validates against the provider registry before writing.

alter table public.organizations
  add column if not exists website_provider text;
