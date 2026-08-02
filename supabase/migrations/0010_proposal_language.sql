-- Proposals are written in the business location's local language (e.g. a lead
-- in Linz, Austria gets Austrian German) to better connect with the owner.
-- `body` holds that local-language text (this is what actually gets sent);
-- `body_translation` keeps a faithful English translation so the sender can
-- verify the wording, and `language` names the language that was used.
alter table public.proposals
  add column if not exists language text,
  add column if not exists body_translation text;
