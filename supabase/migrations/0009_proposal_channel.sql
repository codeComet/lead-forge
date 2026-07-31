-- Proposals can be written for different outreach channels. Email is the
-- default long-form proposal; instagram is a short DM built around the demo
-- preview link (for businesses with no email/website, reachable only on IG).
alter table public.proposals
  add column if not exists channel text not null default 'email'
    check (channel in ('email', 'instagram'));
