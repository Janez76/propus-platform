-- Einmal in Supabase: SQL Editor → New query → ausführen.
-- Öffentlicher Zugriff ist gesperrt (RLS); nur der Service-Role-Key vom Server umgeht RLS.

create table if not exists public.cms_state (
	id smallint primary key default 1,
	payload jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now(),
	constraint cms_state_singleton check (id = 1)
);

alter table public.cms_state enable row level security;

-- Keine Policies für anon/authenticated → nur Service Role kann lesen/schreiben.

insert into public.cms_state (id, payload)
values (
	1,
	'{"version":1,"media":[],"portfolio":[],"featuredPortfolioIds":[],"team":[],"clientLogos":[],"services":[]}'::jsonb
)
on conflict (id) do nothing;
