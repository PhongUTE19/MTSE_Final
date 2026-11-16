-- LOCAL ONLY: never apply remotely without approval.
-- Forward-only migration for P2-T14: persist explicit token usage provenance (usage_source)
-- on ai_usage_analytics without altering or fabricating historical rows.
begin;

alter table public.ai_usage_analytics
  add column if not exists usage_source text
    check (usage_source in ('provider_reported', 'derived', 'unavailable', 'unknown'));

commit;
