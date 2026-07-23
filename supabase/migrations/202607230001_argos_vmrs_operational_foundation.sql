-- ARGOS™ Version 1.0 — Sprint 001Y
-- VMRS customer-supplied catalog, import pipeline, and repair coding foundation.
-- This migration contains no VMRS reference content.

begin;
create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Required table public.organizations does not exist.';
  end if;

  if to_regclass('public.profiles') is null then
    raise exception 'Required table public.profiles does not exist.';
  end if;

  if to_regclass('public.assets') is null then
    raise exception 'Required table public.assets does not exist.';
  end if;

  if to_regclass('public.repair_history') is null then
    raise exception 'Required table public.repair_history does not exist. Confirm the production repair-history table name before applying this migration.';
  end if;
end;
$$;

create or replace function public.argos_vmrs_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.argos_vmrs_normalize_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code := btrim(new.code);
  new.code_type := upper(btrim(new.code_type));
  new.description := btrim(new.description);

  if new.full_code is not null then
    new.full_code := nullif(btrim(new.full_code), '');
  end if;

  return new;
end;
$$;

create table if not exists public.vmrs_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  original_filename text not null,
  import_status text not null default 'PROCESSING',
  accepted_count integer not null default 0,
  warning_count integer not null default 0,
  rejected_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vmrs_import_batches_filename_not_blank check (btrim(original_filename) <> ''),
  constraint vmrs_import_batches_status_check check (import_status in ('PROCESSING','COMPLETED','FAILED')),
  constraint vmrs_import_batches_counts_nonnegative check (accepted_count >= 0 and warning_count >= 0 and rejected_count >= 0)
);

create table if not exists public.vmrs_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid references public.vmrs_import_batches(id) on delete set null,
  code text not null,
  code_type text not null,
  description text not null,
  parent_id uuid references public.vmrs_codes(id) on delete set null,
  hierarchy_level integer,
  full_code text,
  system_code text,
  assembly_code text,
  component_code text,
  reason_code text,
  work_accomplished_code text,
  position_code text,
  source_name text,
  source_version text,
  effective_date date,
  retired_date date,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vmrs_codes_code_not_blank check (btrim(code) <> ''),
  constraint vmrs_codes_description_not_blank check (btrim(description) <> ''),
  constraint vmrs_codes_type_check check (upper(btrim(code_type)) in ('SYSTEM','ASSEMBLY','COMPONENT','REASON','WORK_ACCOMPLISHED','POSITION','OTHER')),
  constraint vmrs_codes_hierarchy_nonnegative check (hierarchy_level is null or hierarchy_level >= 0),
  constraint vmrs_codes_dates_valid check (retired_date is null or effective_date is null or retired_date >= effective_date)
);

create table if not exists public.vmrs_import_staging (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid not null references public.vmrs_import_batches(id) on delete cascade,
  row_number integer not null,
  raw_record jsonb not null default '{}'::jsonb,
  code text,
  code_type text,
  description text,
  parent_code text,
  hierarchy_level integer,
  validation_status text not null,
  validation_messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint vmrs_import_staging_row_positive check (row_number > 0),
  constraint vmrs_import_staging_status_check check (validation_status in ('VALID','WARNING','REJECTED')),
  unique (import_batch_id, row_number)
);

create table if not exists public.vmrs_organization_configuration (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vmrs_code_id uuid not null references public.vmrs_codes(id) on delete cascade,
  display_name text,
  notes text,
  display_order integer not null default 100,
  is_enabled boolean not null default true,
  is_required boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, vmrs_code_id)
);


-- Compatibility upgrade for partially created VMRS tables.
-- CREATE TABLE IF NOT EXISTS does not add missing columns to an existing table.

alter table public.vmrs_import_batches
  add column if not exists organization_id uuid,
  add column if not exists original_filename text,
  add column if not exists import_status text default 'PROCESSING',
  add column if not exists accepted_count integer default 0,
  add column if not exists warning_count integer default 0,
  add column if not exists rejected_count integer default 0,
  add column if not exists created_by uuid,
  add column if not exists started_at timestamptz default timezone('utc', now()),
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists error_message text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.vmrs_codes
  add column if not exists organization_id uuid,
  add column if not exists import_batch_id uuid,
  add column if not exists code text,
  add column if not exists code_type text,
  add column if not exists description text,
  add column if not exists parent_id uuid,
  add column if not exists hierarchy_level integer,
  add column if not exists full_code text,
  add column if not exists system_code text,
  add column if not exists assembly_code text,
  add column if not exists component_code text,
  add column if not exists reason_code text,
  add column if not exists work_accomplished_code text,
  add column if not exists position_code text,
  add column if not exists source_name text,
  add column if not exists source_version text,
  add column if not exists effective_date date,
  add column if not exists retired_date date,
  add column if not exists is_active boolean default true,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.vmrs_import_staging
  add column if not exists organization_id uuid,
  add column if not exists import_batch_id uuid,
  add column if not exists row_number integer,
  add column if not exists raw_record jsonb default '{}'::jsonb,
  add column if not exists code text,
  add column if not exists code_type text,
  add column if not exists description text,
  add column if not exists parent_code text,
  add column if not exists hierarchy_level integer,
  add column if not exists validation_status text,
  add column if not exists validation_messages jsonb default '[]'::jsonb,
  add column if not exists created_at timestamptz default timezone('utc', now());

alter table public.vmrs_organization_configuration
  add column if not exists organization_id uuid,
  add column if not exists vmrs_code_id uuid,
  add column if not exists display_name text,
  add column if not exists notes text,
  add column if not exists display_order integer default 100,
  add column if not exists is_enabled boolean default true,
  add column if not exists is_required boolean default false,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

create unique index if not exists vmrs_codes_org_type_code_uq
  on public.vmrs_codes (organization_id, upper(btrim(code_type)), upper(btrim(code)));
create index if not exists vmrs_codes_org_active_type_idx on public.vmrs_codes (organization_id, is_active, code_type, code);
create index if not exists vmrs_codes_parent_idx on public.vmrs_codes (parent_id);
create index if not exists vmrs_codes_search_idx on public.vmrs_codes using gin (to_tsvector('english', coalesce(code,'') || ' ' || coalesce(description,'')));
create index if not exists vmrs_import_batches_org_created_idx on public.vmrs_import_batches (organization_id, created_at desc);
create index if not exists vmrs_staging_batch_idx on public.vmrs_import_staging (organization_id, import_batch_id, row_number);
create index if not exists vmrs_configuration_org_enabled_idx on public.vmrs_organization_configuration (organization_id, is_enabled, display_order);

create or replace function public.argos_validate_vmrs_code_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_org uuid;
  batch_org uuid;
begin
  if new.parent_id is not null then
    select organization_id
      into parent_org
      from public.vmrs_codes
     where id = new.parent_id;

    if parent_org is null or parent_org <> new.organization_id then
      raise exception 'The selected parent VMRS code does not belong to this organization.';
    end if;
  end if;

  if new.import_batch_id is not null then
    select organization_id
      into batch_org
      from public.vmrs_import_batches
     where id = new.import_batch_id;

    if batch_org is null or batch_org <> new.organization_id then
      raise exception 'The selected VMRS import batch does not belong to this organization.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.argos_validate_vmrs_staging_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  batch_org uuid;
begin
  select organization_id
    into batch_org
    from public.vmrs_import_batches
   where id = new.import_batch_id;

  if batch_org is null or batch_org <> new.organization_id then
    raise exception 'The selected VMRS import batch does not belong to this staging-row organization.';
  end if;

  return new;
end;
$$;

drop trigger if exists argos_vmrs_codes_normalize on public.vmrs_codes;
create trigger argos_vmrs_codes_normalize
before insert or update of code, code_type, description, full_code
on public.vmrs_codes
for each row execute function public.argos_vmrs_normalize_code();

drop trigger if exists argos_validate_vmrs_code_scope on public.vmrs_codes;
create trigger argos_validate_vmrs_code_scope
before insert or update of organization_id, parent_id, import_batch_id
on public.vmrs_codes
for each row execute function public.argos_validate_vmrs_code_scope();

drop trigger if exists argos_validate_vmrs_staging_scope on public.vmrs_import_staging;
create trigger argos_validate_vmrs_staging_scope
before insert or update of organization_id, import_batch_id
on public.vmrs_import_staging
for each row execute function public.argos_validate_vmrs_staging_scope();

create or replace function public.argos_validate_vmrs_configuration_scope()
returns trigger language plpgsql set search_path = public as $$
declare code_org uuid;
begin
  select organization_id into code_org from public.vmrs_codes where id = new.vmrs_code_id;
  if code_org is null or code_org <> new.organization_id then
    raise exception 'The selected VMRS code does not belong to this organization.';
  end if;
  return new;
end;
$$;

drop trigger if exists argos_validate_vmrs_configuration_scope on public.vmrs_organization_configuration;
create trigger argos_validate_vmrs_configuration_scope
before insert or update of organization_id, vmrs_code_id on public.vmrs_organization_configuration
for each row execute function public.argos_validate_vmrs_configuration_scope();

drop trigger if exists argos_vmrs_codes_set_updated_at on public.vmrs_codes;
create trigger argos_vmrs_codes_set_updated_at before update on public.vmrs_codes
for each row execute function public.argos_vmrs_set_updated_at();
drop trigger if exists argos_vmrs_batches_set_updated_at on public.vmrs_import_batches;
create trigger argos_vmrs_batches_set_updated_at before update on public.vmrs_import_batches
for each row execute function public.argos_vmrs_set_updated_at();
drop trigger if exists argos_vmrs_configuration_set_updated_at on public.vmrs_organization_configuration;
create trigger argos_vmrs_configuration_set_updated_at before update on public.vmrs_organization_configuration
for each row execute function public.argos_vmrs_set_updated_at();

-- Operational snapshots preserve descriptions even if a future catalog changes.
do $$
declare
  target_table text;
  prefix text;
  constraint_name text;
begin
  foreach target_table in array array['assets', 'repair_history'] loop
    execute format('alter table public.%I add column if not exists primary_vmrs text', target_table);
    execute format('alter table public.%I add column if not exists secondary_vmrs text', target_table);

    foreach prefix in array array['system','assembly','component','reason','work_accomplished','position'] loop
      execute format('alter table public.%I add column if not exists vmrs_%s_code_id uuid', target_table, prefix);
      execute format('alter table public.%I add column if not exists vmrs_%s_code text', target_table, prefix);
      execute format('alter table public.%I add column if not exists vmrs_%s_description text', target_table, prefix);

      constraint_name := format('%s_vmrs_%s_code_id_fkey', target_table, prefix);

      if not exists (
        select 1
          from pg_constraint
         where conname = constraint_name
           and conrelid = format('public.%I', target_table)::regclass
      ) then
        execute format(
          'alter table public.%I add constraint %I foreign key (vmrs_%s_code_id) references public.vmrs_codes(id) on delete set null',
          target_table,
          constraint_name,
          prefix
        );
      end if;

      execute format(
        'create index if not exists %I on public.%I (vmrs_%s_code_id)',
        format('%s_vmrs_%s_code_id_idx', target_table, prefix),
        target_table,
        prefix
      );
    end loop;

    execute format('alter table public.%I add column if not exists vmrs_coded_at timestamptz', target_table);
    execute format('alter table public.%I add column if not exists vmrs_coded_by uuid', target_table);
    execute format('alter table public.%I add column if not exists repair_opened_at date', target_table);
    execute format('alter table public.%I add column if not exists repair_completed_at date', target_table);
    execute format('alter table public.%I add column if not exists mileage_at_repair numeric', target_table);
    execute format('alter table public.%I add column if not exists engine_hours_at_repair numeric', target_table);
    execute format('alter table public.%I add column if not exists warranty_status text', target_table);
    execute format('alter table public.%I add column if not exists repair_timeline jsonb not null default ''[]''::jsonb', target_table);

    constraint_name := format('%s_vmrs_coded_by_fkey', target_table);

    if not exists (
      select 1
        from pg_constraint
       where conname = constraint_name
         and conrelid = format('public.%I', target_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (vmrs_coded_by) references auth.users(id) on delete set null',
        target_table,
        constraint_name
      );
    end if;
  end loop;
end;
$$;

alter table public.vmrs_import_batches enable row level security;
alter table public.vmrs_codes enable row level security;
alter table public.vmrs_import_staging enable row level security;
alter table public.vmrs_organization_configuration enable row level security;

-- Organization readers.
drop policy if exists "Users can read VMRS batches for their organization" on public.vmrs_import_batches;
create policy "Users can read VMRS batches for their organization" on public.vmrs_import_batches for select to authenticated
using (organization_id = (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can read VMRS codes for their organization" on public.vmrs_codes;
create policy "Users can read VMRS codes for their organization" on public.vmrs_codes for select to authenticated
using (organization_id = (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can read VMRS configuration for their organization" on public.vmrs_organization_configuration;
create policy "Users can read VMRS configuration for their organization" on public.vmrs_organization_configuration for select to authenticated
using (organization_id = (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Admins and managers can read VMRS staging for their organization" on public.vmrs_import_staging;
create policy "Admins and managers can read VMRS staging for their organization"
on public.vmrs_import_staging
for select
to authenticated
using (
  organization_id = (
    select organization_id
      from public.profiles
     where id = auth.uid()
       and lower(coalesce(role, '')) in ('admin', 'administrator', 'manager')
  )
);

-- Admin/manager import and configuration writes.
drop policy if exists "Admins and managers can manage VMRS batches" on public.vmrs_import_batches;
create policy "Admins and managers can manage VMRS batches" on public.vmrs_import_batches for all to authenticated
using (organization_id = (select organization_id from public.profiles where id = auth.uid() and lower(coalesce(role,'')) in ('admin','administrator','manager')))
with check (organization_id = (select organization_id from public.profiles where id = auth.uid() and lower(coalesce(role,'')) in ('admin','administrator','manager')));
drop policy if exists "Admins and managers can manage VMRS codes" on public.vmrs_codes;
create policy "Admins and managers can manage VMRS codes" on public.vmrs_codes for all to authenticated
using (organization_id = (select organization_id from public.profiles where id = auth.uid() and lower(coalesce(role,'')) in ('admin','administrator','manager')))
with check (organization_id = (select organization_id from public.profiles where id = auth.uid() and lower(coalesce(role,'')) in ('admin','administrator','manager')));
drop policy if exists "Admins and managers can manage VMRS staging" on public.vmrs_import_staging;
create policy "Admins and managers can manage VMRS staging" on public.vmrs_import_staging for all to authenticated
using (organization_id = (select organization_id from public.profiles where id = auth.uid() and lower(coalesce(role,'')) in ('admin','administrator','manager')))
with check (organization_id = (select organization_id from public.profiles where id = auth.uid() and lower(coalesce(role,'')) in ('admin','administrator','manager')));
drop policy if exists "Admins and managers can manage VMRS configuration" on public.vmrs_organization_configuration;
create policy "Admins and managers can manage VMRS configuration" on public.vmrs_organization_configuration for all to authenticated
using (organization_id = (select organization_id from public.profiles where id = auth.uid() and lower(coalesce(role,'')) in ('admin','administrator','manager')))
with check (organization_id = (select organization_id from public.profiles where id = auth.uid() and lower(coalesce(role,'')) in ('admin','administrator','manager')));

grant select, insert, update, delete on public.vmrs_import_batches to authenticated;
grant select, insert, update, delete on public.vmrs_codes to authenticated;
grant select, insert, update, delete on public.vmrs_import_staging to authenticated;
grant select, insert, update, delete on public.vmrs_organization_configuration to authenticated;

comment on table public.vmrs_codes is 'Organization-owned VMRS reference records imported from customer-licensed data. ARGOS distributes no VMRS content.';
comment on table public.vmrs_import_staging is 'Validated source rows retained for import audit and diagnostics.';
comment on table public.vmrs_organization_configuration is 'Organization-level enablement and presentation settings for organization-owned VMRS codes.';
comment on column public.vmrs_codes.parent_id is 'Optional hierarchy parent. A trigger prevents cross-organization parent relationships.';

commit;
