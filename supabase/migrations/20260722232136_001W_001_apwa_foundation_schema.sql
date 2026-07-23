-- ARGOS™ Version 1.0
-- Sprint 001W-001 — APWA Foundation Schema
-- Purpose:
--   1. Create a data-driven APWA reference catalog.
--   2. Create organization-specific APWA recommendation rules.
--   3. Allow each asset to store its final selected APWA classification.
--   4. Preserve existing apwa_code and apwa_description columns during transition.
--
-- This migration intentionally makes no UI or workflow changes.
-- It is forward-only and designed for Supabase PostgreSQL.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared timestamp trigger dedicated to APWA tables
-- -----------------------------------------------------------------------------

create or replace function public.argos_apwa_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- APWA reference catalog
-- Global reference data; not organization-owned.
-- The application may import or update official APWA data without code changes.
-- -----------------------------------------------------------------------------

create table if not exists public.apwa_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text not null,
  category text,
  subcategory text,
  source_name text not null default 'APWA',
  source_version text,
  effective_date date,
  retired_date date,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint apwa_codes_code_not_blank check (btrim(code) <> ''),
  constraint apwa_codes_description_not_blank check (btrim(description) <> ''),
  constraint apwa_codes_retirement_dates_valid check (
    retired_date is null
    or effective_date is null
    or retired_date >= effective_date
  )
);

create unique index if not exists apwa_codes_code_version_uq
  on public.apwa_codes (
    lower(btrim(code)),
    coalesce(lower(btrim(source_version)), '')
  );

create index if not exists apwa_codes_active_code_idx
  on public.apwa_codes (is_active, code);

create index if not exists apwa_codes_description_search_idx
  on public.apwa_codes using gin (
    to_tsvector('english', coalesce(code, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, ''))
  );

drop trigger if exists argos_apwa_codes_set_updated_at on public.apwa_codes;
create trigger argos_apwa_codes_set_updated_at
before update on public.apwa_codes
for each row
execute function public.argos_apwa_set_updated_at();

comment on table public.apwa_codes is
  'Selectable APWA equipment classification reference catalog. Values are data-driven and may be imported or revised without application code changes.';

-- -----------------------------------------------------------------------------
-- Organization-specific recommendation rules
--
-- Supported rule specificity:
--   1. Department + Asset Type (exact match)
--   2. Asset Type only
--   3. Department only
--
-- At least one of department_id or asset_type_id must be present.
-- The selected APWA assignment on an asset remains independently overridable.
-- -----------------------------------------------------------------------------

create table if not exists public.apwa_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  asset_type_id uuid references public.asset_types(id) on delete cascade,
  recommended_apwa_code_id uuid not null references public.apwa_codes(id) on delete restrict,
  rule_name text,
  notes text,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint apwa_mapping_rules_has_scope check (
    department_id is not null or asset_type_id is not null
  ),
  constraint apwa_mapping_rules_priority_valid check (priority >= 0)
);

-- PostgreSQL treats NULL values as distinct in ordinary unique constraints,
-- so partial unique indexes are used for each supported rule shape.
create unique index if not exists apwa_mapping_rules_org_department_asset_type_uq
  on public.apwa_mapping_rules (organization_id, department_id, asset_type_id)
  where department_id is not null and asset_type_id is not null;

create unique index if not exists apwa_mapping_rules_org_asset_type_only_uq
  on public.apwa_mapping_rules (organization_id, asset_type_id)
  where department_id is null and asset_type_id is not null;

create unique index if not exists apwa_mapping_rules_org_department_only_uq
  on public.apwa_mapping_rules (organization_id, department_id)
  where department_id is not null and asset_type_id is null;

create index if not exists apwa_mapping_rules_resolution_idx
  on public.apwa_mapping_rules (
    organization_id,
    is_active,
    department_id,
    asset_type_id,
    priority
  );

create index if not exists apwa_mapping_rules_code_idx
  on public.apwa_mapping_rules (recommended_apwa_code_id);

drop trigger if exists argos_apwa_mapping_rules_set_updated_at on public.apwa_mapping_rules;
create trigger argos_apwa_mapping_rules_set_updated_at
before update on public.apwa_mapping_rules
for each row
execute function public.argos_apwa_set_updated_at();

comment on table public.apwa_mapping_rules is
  'Organization-specific rules that recommend an APWA classification from Department, Asset Type, or their exact combination.';

-- -----------------------------------------------------------------------------
-- Validate that mapping references belong to the same organization
-- -----------------------------------------------------------------------------

create or replace function public.argos_validate_apwa_mapping_rule_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_department_organization uuid;
  resolved_asset_type_organization uuid;
begin
  if new.department_id is not null then
    select organization_id
      into resolved_department_organization
      from public.departments
     where id = new.department_id;

    if resolved_department_organization is null
       or resolved_department_organization <> new.organization_id then
      raise exception 'The selected department does not belong to the mapping rule organization.';
    end if;
  end if;

  if new.asset_type_id is not null then
    select organization_id
      into resolved_asset_type_organization
      from public.asset_types
     where id = new.asset_type_id;

    if resolved_asset_type_organization is null
       or resolved_asset_type_organization <> new.organization_id then
      raise exception 'The selected asset type does not belong to the mapping rule organization.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists argos_validate_apwa_mapping_rule_scope on public.apwa_mapping_rules;
create trigger argos_validate_apwa_mapping_rule_scope
before insert or update of organization_id, department_id, asset_type_id
on public.apwa_mapping_rules
for each row
execute function public.argos_validate_apwa_mapping_rule_scope();

-- -----------------------------------------------------------------------------
-- Asset assignment
-- Keep current text columns for compatibility while introducing a normalized FK.
-- -----------------------------------------------------------------------------

alter table public.assets
  add column if not exists apwa_code_id uuid;

alter table public.assets
  add column if not exists apwa_assignment_source text;

alter table public.assets
  add column if not exists apwa_mapping_rule_id uuid;

alter table public.assets
  add column if not exists apwa_assigned_at timestamptz;

alter table public.assets
  add column if not exists apwa_assigned_by uuid;

-- Add foreign keys conditionally so rerunning the migration remains safe.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'assets_apwa_code_id_fkey'
       and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
      add constraint assets_apwa_code_id_fkey
      foreign key (apwa_code_id)
      references public.apwa_codes(id)
      on delete set null;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'assets_apwa_mapping_rule_id_fkey'
       and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
      add constraint assets_apwa_mapping_rule_id_fkey
      foreign key (apwa_mapping_rule_id)
      references public.apwa_mapping_rules(id)
      on delete set null;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'assets_apwa_assigned_by_fkey'
       and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
      add constraint assets_apwa_assigned_by_fkey
      foreign key (apwa_assigned_by)
      references auth.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'assets_apwa_assignment_source_check'
       and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
      add constraint assets_apwa_assignment_source_check
      check (
        apwa_assignment_source is null
        or apwa_assignment_source in (
          'exact_match',
          'asset_type_match',
          'department_match',
          'manual_override',
          'legacy_import'
        )
      );
  end if;
end;
$$;

create index if not exists assets_apwa_code_id_idx
  on public.assets (apwa_code_id);

create index if not exists assets_organization_apwa_code_idx
  on public.assets (organization_id, apwa_code_id);

comment on column public.assets.apwa_code_id is
  'Final APWA classification selected for this asset. May be accepted from a recommendation or manually overridden.';

comment on column public.assets.apwa_assignment_source is
  'Explains how the final APWA assignment was selected: exact match, asset type match, department match, manual override, or legacy import.';

-- -----------------------------------------------------------------------------
-- Recommendation resolver
-- Returns the best active rule using the agreed confidence order.
-- -----------------------------------------------------------------------------

create or replace function public.argos_resolve_apwa_recommendation(
  requested_organization_id uuid,
  requested_department_id uuid,
  requested_asset_type_id uuid
)
returns table (
  mapping_rule_id uuid,
  apwa_code_id uuid,
  apwa_code text,
  apwa_description text,
  match_type text,
  confidence_rank integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    rule.id as mapping_rule_id,
    code.id as apwa_code_id,
    code.code as apwa_code,
    code.description as apwa_description,
    case
      when rule.department_id is not null and rule.asset_type_id is not null
        then 'exact_match'
      when rule.asset_type_id is not null
        then 'asset_type_match'
      when rule.department_id is not null
        then 'department_match'
    end as match_type,
    case
      when rule.department_id is not null and rule.asset_type_id is not null then 1
      when rule.asset_type_id is not null then 2
      when rule.department_id is not null then 3
      else 99
    end as confidence_rank
  from public.apwa_mapping_rules rule
  join public.apwa_codes code
    on code.id = rule.recommended_apwa_code_id
  where rule.organization_id = requested_organization_id
    and rule.is_active = true
    and code.is_active = true
    and (
      (
        rule.department_id = requested_department_id
        and rule.asset_type_id = requested_asset_type_id
      )
      or (
        rule.department_id is null
        and rule.asset_type_id = requested_asset_type_id
      )
      or (
        rule.department_id = requested_department_id
        and rule.asset_type_id is null
      )
    )
  order by confidence_rank asc, rule.priority asc, rule.updated_at desc
  limit 1;
$$;

comment on function public.argos_resolve_apwa_recommendation(uuid, uuid, uuid) is
  'Returns the highest-confidence APWA recommendation: Department + Asset Type, then Asset Type only, then Department only.';

-- -----------------------------------------------------------------------------
-- Optional legacy matching preparation
-- This does not assign codes automatically. It only links assets where an existing
-- text APWA code exactly matches a catalog row after that catalog is imported.
-- It is safe to run again after APWA data is loaded.
-- -----------------------------------------------------------------------------

create or replace function public.argos_link_legacy_apwa_asset_values()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.assets asset
     set apwa_code_id = code.id,
         apwa_assignment_source = coalesce(asset.apwa_assignment_source, 'legacy_import'),
         apwa_assigned_at = coalesce(asset.apwa_assigned_at, timezone('utc', now()))
    from public.apwa_codes code
   where asset.apwa_code_id is null
     and nullif(btrim(asset.apwa_code), '') is not null
     and lower(btrim(asset.apwa_code)) = lower(btrim(code.code))
     and code.is_active = true;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- Existing ARGOS tenancy is based on profiles.organization_id.
-- Reference codes are readable by authenticated users.
-- Organization rules are visible only within the user's organization.
-- Rule changes are limited to admin and manager roles.
-- -----------------------------------------------------------------------------

alter table public.apwa_codes enable row level security;
alter table public.apwa_mapping_rules enable row level security;

drop policy if exists "Authenticated users can read active APWA codes" on public.apwa_codes;
create policy "Authenticated users can read active APWA codes"
on public.apwa_codes
for select
to authenticated
using (is_active = true);

-- APWA catalog maintenance should occur through trusted administrative SQL,
-- migrations, or service-role imports. No client-side INSERT/UPDATE/DELETE policy
-- is intentionally granted on public.apwa_codes.

drop policy if exists "Users can read APWA rules for their organization" on public.apwa_mapping_rules;
create policy "Users can read APWA rules for their organization"
on public.apwa_mapping_rules
for select
to authenticated
using (
  organization_id = (
    select profile.organization_id
      from public.profiles profile
     where profile.id = auth.uid()
  )
);

drop policy if exists "Admins and managers can create APWA rules" on public.apwa_mapping_rules;
create policy "Admins and managers can create APWA rules"
on public.apwa_mapping_rules
for insert
to authenticated
with check (
  organization_id = (
    select profile.organization_id
      from public.profiles profile
     where profile.id = auth.uid()
       and lower(coalesce(profile.role, '')) in ('admin', 'manager')
  )
);

drop policy if exists "Admins and managers can update APWA rules" on public.apwa_mapping_rules;
create policy "Admins and managers can update APWA rules"
on public.apwa_mapping_rules
for update
to authenticated
using (
  organization_id = (
    select profile.organization_id
      from public.profiles profile
     where profile.id = auth.uid()
       and lower(coalesce(profile.role, '')) in ('admin', 'manager')
  )
)
with check (
  organization_id = (
    select profile.organization_id
      from public.profiles profile
     where profile.id = auth.uid()
       and lower(coalesce(profile.role, '')) in ('admin', 'manager')
  )
);

drop policy if exists "Admins and managers can delete APWA rules" on public.apwa_mapping_rules;
create policy "Admins and managers can delete APWA rules"
on public.apwa_mapping_rules
for delete
to authenticated
using (
  organization_id = (
    select profile.organization_id
      from public.profiles profile
     where profile.id = auth.uid()
       and lower(coalesce(profile.role, '')) in ('admin', 'manager')
  )
);

-- Explicit grants align with Supabase's authenticated role while RLS remains
-- the enforcement boundary.
grant select on public.apwa_codes to authenticated;
grant select, insert, update, delete on public.apwa_mapping_rules to authenticated;
grant execute on function public.argos_resolve_apwa_recommendation(uuid, uuid, uuid) to authenticated;
grant execute on function public.argos_link_legacy_apwa_asset_values() to authenticated;

commit;

-- -----------------------------------------------------------------------------
-- Post-migration validation queries (run manually; do not include in a transaction)
-- -----------------------------------------------------------------------------
-- select to_regclass('public.apwa_codes');
-- select to_regclass('public.apwa_mapping_rules');
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'assets'
--    and column_name like 'apwa%'
--  order by ordinal_position;
-- select * from public.argos_resolve_apwa_recommendation(
--   '<organization_uuid>'::uuid,
--   '<department_uuid>'::uuid,
--   '<asset_type_uuid>'::uuid
-- );
