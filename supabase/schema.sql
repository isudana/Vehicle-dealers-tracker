-- Vehicle Import, Cost Ledger & Sales Management Platform schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- WARNING: this drops and recreates every table except `profiles`. Destructive.
-- Also creates 7 Storage buckets (vehicle-photos, supplier-logos, resource-logos,
-- app-branding, receipt-attachments, vehicle-documents, cash-entity-logos) — no
-- manual Storage dashboard setup needed.

-- ============ Cleanup (FK-safe order) ============
drop view if exists cash_entity_balance;
drop view if exists model_summary;
drop view if exists executive_summary;
drop view if exists supplier_balance; -- from an earlier version of this schema
drop view if exists supplier_balance_holds_summary;
drop view if exists vehicle_pnl;
drop view if exists car_profit; -- from the earlier prototype schema

drop table if exists app_settings cascade;
drop table if exists chassis_year_ranges cascade;
drop table if exists resources cascade;
drop table if exists overhead_expenses cascade;
drop table if exists overhead_categories cascade;
drop table if exists capital_injections cascade; -- from an earlier version of this schema
drop table if exists supplier_balance_holds cascade;
drop table if exists invoices cascade;
drop table if exists sale_receipts cascade;
drop table if exists sales cascade;
drop table if exists customers cascade;
drop table if exists supplier_advances cascade; -- from an earlier version of this schema
drop table if exists vehicle_photos cascade;
drop table if exists vehicle_documents cascade;
drop table if exists vehicle_expenses cascade;
drop table if exists cash_transfers cascade;
drop table if exists cash_entities cascade;
drop table if exists vehicles cascade;
drop table if exists vehicle_models cascade;
drop table if exists cost_heads cascade;

-- from the earlier prototype schema (dropped before `suppliers`, which they reference)
drop table if exists supplier_payments cascade;
drop table if exists expenses cascade;
drop table if exists expense_categories cascade;
drop table if exists cars cascade;

drop table if exists suppliers cascade;

drop type if exists transfer_method;
drop type if exists cash_entity_category;
drop type if exists cash_entity_direction; -- from an earlier version of this schema
drop type if exists cash_entity_type;
drop type if exists receipt_method;
drop type if exists advance_type; -- from an earlier version of this schema
drop type if exists leasing_status_t;
drop type if exists payment_type_t;
drop type if exists vehicle_status_t;
drop type if exists spare_key_status_t;

-- ============ Profiles (unchanged, auth-linked) ============
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Role model: added the same way `profiles` itself is carved out from the drop/recreate
-- cycle above (guarded, never dropped) — otherwise every schema re-run would wipe
-- everyone's role back to the default. The one-time backfill below promotes whatever
-- account(s) already exist to Admin so nobody is locked out the first time this lands.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role_t') then
    create type user_role_t as enum ('ADMIN', 'STAFF', 'VIEWER');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'role') then
    alter table profiles add column role user_role_t not null default 'VIEWER';
    alter table profiles add column email text;
    update profiles set role = 'ADMIN', email = u.email from auth.users u where u.id = profiles.id;
  end if;
end $$;

-- security definer functions inherit the caller's search_path unless told otherwise, and
-- auth.users inserts run under Supabase's internal auth role, whose search_path doesn't
-- include `public` — without "set search_path = public" the unqualified ::user_role_t cast
-- below fails to resolve the type, which GoTrue surfaces as an opaque "Database error
-- creating new user". Explicit schema-qualification on the type is a second, redundant guard.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role_t, 'VIEWER'::public.user_role_t)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns user_role_t
language sql
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.enforce_profile_role_change()
returns trigger as $$
begin
  if new.role is distinct from old.role and public.current_user_role() <> 'ADMIN' then
    raise exception 'Only admins can change user roles';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_profile_role_change on profiles;
create trigger on_profile_role_change
  before update on profiles
  for each row execute procedure public.enforce_profile_role_change();

-- ============ Enums ============
create type vehicle_status_t as enum ('BOUGHT_NOT_RECEIVED', 'IN_STOCK', 'SOLD_PENDING_PAYMENT', 'SOLD_FULLY_CLOSED');
create type payment_type_t as enum ('DIRECT_CASH', 'LEASING', 'HYBRID');
create type leasing_status_t as enum ('NOT_APPLICABLE', 'PENDING', 'RECEIVED');
create type spare_key_status_t as enum ('AVAILABLE', 'PENDING', 'NOT_AVAILABLE', 'RECEIVED');
create type receipt_method as enum ('ADVANCE', 'DIRECT_CASH', 'LEASING_DISBURSAL');
-- 'CASH' and 'OTHER' are not among the 8 originally requested types — 'CASH' was added for
-- pools like Petty Cash (physical cash-in-hand rather than a bank account), 'OTHER' as a
-- catch-all for destination-only parties that don't fit the rest.
create type cash_entity_type as enum
  ('GOVERNMENT', 'PORT', 'SUPPLIER', 'DRIVER', 'MECHANIC', 'INVESTOR', 'BANK', 'CLEARING_AGENT', 'CASH',
   'LEASING_COMPANY', 'CUSTOMER', 'OTHER');
create type transfer_method as enum ('TT', 'LC', 'CASH', 'BANK_TRANSFER', 'OTHER');
-- Every cash entity belongs to one of four categories, which fixes its directionality:
-- CASH_ACCOUNT (banks, petty cash, supplier accounts), INVESTOR, and LEASING_COMPANY are
-- bidirectional — genuine pools of money you hold or that pay you. CASH_ENTITY
-- (government/port bodies, drivers, mechanics, clearing agents, and a supplier's
-- vehicle-payment record) is destination only — you only ever pay into these, never hold
-- or draw down a balance with them. Enforced both in the UI (dropdown filtering) and at
-- the DB level below.
create type cash_entity_category as enum ('CASH_ACCOUNT', 'CASH_ENTITY', 'INVESTOR', 'LEASING_COMPANY');

-- ============ App-wide settings (singleton row) ============
create table app_settings (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'Vehicle Dealers Tracker',
  logo_path text,
  address text,
  phone text,
  email text
);

insert into app_settings (id, app_name) values (1, 'Vehicle Dealers Tracker');

-- ============ Suppliers ============
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'Japan',
  primary_currency text not null default 'JPY',
  contact_person text,
  phone text,
  email text,
  logo_path text,
  created_at timestamptz not null default now()
);

-- ============ Supplier balance holds (temporary reservations against a supplier's Account) ============
-- "Balance available for purchases" = the supplier's Account balance minus the sum of its
-- active holds — a distinct, more actionable figure than the raw balance.
create table supplier_balance_holds (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  amount numeric(15, 2) not null,
  exchange_rate_to_lkr numeric(12, 6) not null default 1,
  amount_lkr numeric(15, 2) generated always as (round(amount * exchange_rate_to_lkr, 2)) stored,
  reason text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create view supplier_balance_holds_summary as
select supplier_id, sum(amount) as total_held_native, sum(amount_lkr) as total_held_lkr
from supplier_balance_holds
group by supplier_id;

-- ============ Cash entities (people/orgs/pools that money moves between) ============
-- Every supplier automatically gets TWO of these (type SUPPLIER, kept in sync by the
-- trigger below): a CASH_ACCOUNT (a bidirectional prepaid balance — TT deposits/LC
-- transfers sent ahead of a specific purchase) and a CASH_ENTITY (destination-only,
-- what a specific vehicle's LC/TT cost line actually pays into — either freshly from a
-- bank, or drawn down from the supplier's own Account). This is the same mechanism used
-- for banks, petty cash, drivers, mechanics, investors, etc.
create table cash_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type cash_entity_type not null,
  category cash_entity_category not null,
  logo_path text,
  primary_currency text not null default 'LKR',
  supplier_id uuid references suppliers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (supplier_id, category)
);

-- logo_path values point at files already uploaded to the cash-entity-logos bucket
-- (under defaults/) — this table is dropped/recreated on every schema re-run, but Storage
-- objects aren't touched by this script, so re-seeding these paths keeps the logos attached
-- instead of losing them on the next reset.
insert into cash_entities (name, type, category, logo_path) values
  ('HIPG', 'PORT', 'CASH_ENTITY', 'defaults/hipg.jpeg'),
  ('Sri Lanka Customs', 'GOVERNMENT', 'CASH_ENTITY', 'defaults/sri-lanka-customs.png'),
  ('Colombo Port', 'PORT', 'CASH_ENTITY', 'defaults/colombo-port.jpeg'),
  ('RMV', 'GOVERNMENT', 'CASH_ENTITY', 'defaults/rmv.jpeg'),
  ('Petty Cash', 'CASH', 'CASH_ACCOUNT', 'defaults/petty-cash.jpeg'),
  ('Bank LC Dep', 'BANK', 'CASH_ENTITY', 'defaults/bank-lc-dep.png'),
  -- Aggregate source for Advance/Direct Cash sale receipts, so depositing one into a real
  -- Cash Account is a real transfer (source=Customer Payments) rather than an untracked
  -- number — its own balance shows cumulative money received from customers, mirroring
  -- how a Leasing Company's balance reflects cumulative disbursements.
  ('Customer Payments', 'CUSTOMER', 'CASH_ACCOUNT', null);

-- security definer: Staff can create suppliers, but `cash_entities` writes are Admin-only
-- (it's a chart-of-accounts-style config table). This trigger's cash_entities writes are an
-- internal effect of creating a supplier, not a user-facing "Staff edits the chart of
-- accounts" action, so it needs to bypass the caller's own cash_entities grant.
-- The Cash Entity row's name gets a " (Vehicle Purchases)" suffix — without it, a supplier's
-- Cash Account and Cash Entity rows are indistinguishable by name wherever they appear
-- together in an unfiltered entity list (e.g. a transfer's destination dropdown).
create or replace function sync_cash_entity_from_supplier()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into cash_entities (name, type, category, logo_path, primary_currency, supplier_id) values
      (new.name, 'SUPPLIER', 'CASH_ACCOUNT', new.logo_path, new.primary_currency, new.id),
      (new.name || ' (Vehicle Purchases)', 'SUPPLIER', 'CASH_ENTITY', new.logo_path, new.primary_currency, new.id);
  else
    update cash_entities
    set name = new.name, logo_path = new.logo_path, primary_currency = new.primary_currency
    where supplier_id = new.id and category = 'CASH_ACCOUNT';
    update cash_entities
    set name = new.name || ' (Vehicle Purchases)', logo_path = new.logo_path, primary_currency = new.primary_currency
    where supplier_id = new.id and category = 'CASH_ENTITY';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_supplier_change on suppliers;
create trigger on_supplier_change
  after insert or update of name, logo_path, primary_currency on suppliers
  for each row execute procedure sync_cash_entity_from_supplier();

-- ============ Cost heads (lookup, seeded from SRS section 3.2) ============
create table cost_heads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  group_name text not null
);

insert into cost_heads (name, group_name) values
  ('LC Amount', 'Procurement & Bank'),
  ('TT Amount', 'Procurement & Bank'),
  ('Bank Commission', 'Procurement & Bank'),
  ('Bank Charges', 'Procurement & Bank'),
  ('HIPG Charges', 'Port & Logistics'),
  ('DO Charges', 'Port & Logistics'),
  ('Customs Duty', 'Port & Logistics'),
  ('Clearing Charges', 'Port & Logistics'),
  ('Fuel from Hambantota', 'Transit & Reconditioning'),
  ('Driver Charges', 'Transit & Reconditioning'),
  ('Repairs', 'Transit & Reconditioning'),
  ('Car Head Unit Installation', 'Transit & Reconditioning'),
  ('RMV Penalty', 'Legal & Miscellaneous'),
  ('Other', 'Legal & Miscellaneous');

-- ============ Vehicle model catalog (managed via Settings) ============
-- `chassis_code` is a model/platform code shared by every vehicle of this model
-- (e.g. every RAIZE 1200CC HYBRID G is A202A) — distinct from vehicles.chassis_number,
-- which is the unique per-vehicle VIN.
create table vehicle_models (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  name text not null,
  chassis_code text,
  created_at timestamptz not null default now(),
  unique (make, name)
);

insert into vehicle_models (make, name, chassis_code) values
  ('TOYOTA', 'AQUA HYBRID 1500CC HYBRID X', null),
  ('TOYOTA', 'AQUA HYBRID 1500CC HYBRID G', null),
  ('TOYOTA', 'AQUA HYBRID 1500CC HYBRID Z', null),
  ('TOYOTA', 'AXIO 1500CC HYBRID EX', null),
  ('TOYOTA', 'Corolla Cross ZVG11 Hybrid Z 1800 cc', null),
  ('TOYOTA', 'Corolla Sports G "Z"', null),
  ('TOYOTA', 'HARRIER XU80 PETROL Z LEATHER PACKAGE', '6BA-MXUA80-ANXSB(S)'),
  ('TOYOTA', 'HARRIER XU80 PETROL G', null),
  ('TOYOTA', 'HARRIER XU80 PETROL Z', null),
  ('TOYOTA', '6AA-AXUH85 HARRIER Z LEATHER PACKAGE 4WD', null),
  ('TOYOTA', '6AA-AXUH80 HARRIER Z LEATHER PACKAGE 2WD', null),
  ('TOYOTA', '6LA-AXUP85 HARRIER Z Plug-in Hybrid', null),
  ('TOYOTA', 'RAIZE 1000CC PETROL X 4WD', 'A210'),
  ('TOYOTA', 'RAIZE 1000CC PETROL G 4WD', 'A210'),
  ('TOYOTA', 'RAIZE 1000CC PETROL Z 4WD', 'A210'),
  ('TOYOTA', 'RAIZE 1200CC HYBRID G', 'A202A'),
  ('TOYOTA', 'RAIZE 1200CC HYBRID Z', 'A202A'),
  ('TOYOTA', 'RAIZE 1200CC PETROL G', 'A201A'),
  ('TOYOTA', 'RAIZE 1200CC PETROL X', 'A201A'),
  ('TOYOTA', 'RAIZE 1200CC PETROL Z', 'A201A'),
  ('HONDA', 'VEZEL 1500CC HYBRID E: HEV X', null),
  ('HONDA', 'VEZEL 1500CC HYBRID E: HEV X HUNT', null),
  ('HONDA', 'VEZEL 1500CC HYBRID E: HEV Z', null),
  ('HONDA', 'VEZEL 1500CC HYBRID E: HEV Z Premium Audio', null),
  ('HONDA', 'VEZEL 1500CC HYBRID E: HEV Z PLAY', null),
  ('HONDA', 'VEZEL 1500CC HYBRID E: HEV RS', null),
  ('SUZUKI', 'Wagon R HYBRID ZX 2WD CVT', null),
  ('SUZUKI', 'Wagon R HYBRID ZX 4WD CVT', null),
  ('SUZUKI', 'Wagon R ZL 2WD', null),
  ('SUZUKI', 'Wagon R ZL 4WD', null),
  ('TOYOTA', 'YARIS CROSS 1500CC HYBRID G', null),
  ('TOYOTA', 'YARIS CROSS 1500CC HYBRID X', null),
  ('TOYOTA', 'YARIS CROSS 1500CC HYBRID Z', null),
  ('TOYOTA', 'YARIS CROSS 1500CC HYBRID Z ADVENTURE', null),
  ('TOYOTA', 'YARIS HYBRID 1500CC HYBRID G', '6AA-MXPH14- AHXGB'),
  ('TOYOTA', 'YARIS HYBRID 1500CC HYBRID X', '6AA-MXPH14- AHXNB'),
  ('TOYOTA', 'YARIS HYBRID 1500CC HYBRID Z', '6AA-MXPH14- AHXEB'),
  ('TOYOTA', 'YARIS PETROL 1000CC PETROL G', '5BA-KSP210- AHXGK'),
  ('TOYOTA', 'YARIS PETROL 1000CC PETROL X', '5BA-KSP210- AHXNK'),
  ('TOYOTA', 'Crown Z (hybrid car)', null),
  ('SUZUKI', 'ALTO HYBRID X 2WD/CVT', null),
  ('SUZUKI', 'ALTO HYBRID X 4WD/CVT', null),
  ('SUZUKI', 'ALTO HYBRID S 2WD/CVT', null),
  ('SUZUKI', 'ALTO HYBRID S 4WD/CVT', null),
  ('SUZUKI', 'ALTO L 2WD/CVT', null),
  ('SUZUKI', 'ALTO L 4WD/CVT', null),
  ('SUZUKI', 'ALTO L 2WD/CVT Upgraded', null),
  ('SUZUKI', 'ALTO L 4WD/CVT Upgraded', null),
  ('SUZUKI', 'ALTO A 2WD/CVT', null),
  ('SUZUKI', 'ALTO A 4WD/CVT', null),
  ('TOYOTA', 'PIXIS EPOCH B SA III 2WD', null),
  ('TOYOTA', 'PIXIS EPOCH L SA III 2WD', null),
  ('TOYOTA', 'PIXIS EPOCH X SA III 2WD', null),
  ('TOYOTA', 'PIXIS EPOCH G SA III 2WD', null),
  ('MERCEDEZ', 'CLA 180', null),
  ('NISSAN', 'AURA G', 'FE13'),
  ('NISSAN', 'AURA G Leather Edition', 'FE13'),
  ('NISSAN', 'AURA G 90 Aniversary', 'FE13'),
  ('NISSAN', 'AURA NISMO', 'FE13'),
  ('NISSAN', 'AURA AUTECH', 'FE13'),
  ('NISSAN', 'AURA AUTECH SPORTS', 'FE13'),
  ('DAIHATSU', 'TAFT X', null),
  ('DAIHATSU', 'TAFT X TURBO', null),
  ('DAIHATSU', 'TAFT G 2WD', null),
  ('DAIHATSU', 'TAFT G "Chrome Venture"', null),
  ('DAIHATSU', 'TAFT G "Dark Chrome Venture"', null),
  ('DAIHATSU', 'TAFT G TURBO', null),
  ('DAIHATSU', 'TAFT G TURBO "Chrome Venture"', null),
  ('DAIHATSU', 'TAFT G TURBO "Chrome Venture" 4WD', null),
  ('DAIHATSU', 'TAFT G TURBO "Dark Chrome Venture"', null),
  ('AUDI', 'Audi Q3 Sportback', null),
  ('SUZUKI', 'SWIFT HYBRID MZ 2WD/CVT', null),
  ('SUZUKI', 'SWIFT HYBRID MZ 4WD/CVT', null),
  ('SUZUKI', 'SWIFT HYBRID MX 2WD/5MT', null),
  ('SUZUKI', 'SWIFT HYBRID MX 2WD/CVT', null),
  ('SUZUKI', 'SWIFT HYBRID MX 4WD/CVT', null),
  ('SUZUKI', 'SWIFT XG 2WD/CVT', null),
  ('SUZUKI', 'SWIFT XG 4WD/CVT', null),
  ('DAIHATSU', 'Mira e:s B "SA III" 2WD', null),
  ('DAIHATSU', 'Mira e:s L "SA III" 2WD', null),
  ('DAIHATSU', 'Mira e:s X "SA III" 2WD', null),
  ('DAIHATSU', 'Mira e:s G "SA III" 2WD', null),
  ('TOYOTA', 'Roomy Custom G T', null),
  ('TOYOTA', 'Roomy Custom G 2WD', null),
  ('TOYOTA', 'Roomy G', null),
  ('TOYOTA', 'Roomy GT', null),
  ('TOYOTA', 'Roomy X', null),
  ('AUDI', 'Audi A3', null),
  ('SUZUKI', 'Suzuki Jimny XG', null),
  ('SUZUKI', 'Suzuki Jimny XL', null),
  ('SUZUKI', 'Suzuki Jimny XC', null),
  ('NISSAN', 'Nissan Dayz Highway Star X ProPilot Edition', '5AA-B44W'),
  ('NISSAN', 'Nissan Dayz Highway Star G Turbo', null),
  ('SUZUKI', 'EVERY WAGON PZ Turbo Special Standard Roof 2WD', '3BA-DA17W'),
  ('SUZUKI', 'EVERY WAGON PZ Turbo Special Standard Roof 4WD', '3BA-DA17W'),
  ('SUZUKI', 'EVERY WAGON PZ Turbo Special High Roof 2WD', '3BA-DA17W'),
  ('SUZUKI', 'EVERY WAGON PZ Turbo Special High Roof 4WD', '3BA-DA17W'),
  ('SUZUKI', 'EVERY WAGON PZ Turbo Standard Roof 2WD', '3BA-DA17W'),
  ('SUZUKI', 'EVERY WAGON PZ Turbo Standard Roof 4WD', '3BA-DA17W'),
  ('SUZUKI', 'EVERY WAGON PZ Turbo High Roof 2WD', '3BA-DA17W'),
  ('SUZUKI', 'EVERY WAGON PZ Turbo High Roof 4WD', '3BA-DA17W'),
  ('SUZUKI', 'EVERY JOIN Turbo (High Roof) 2WD', '3BD-DA17V'),
  ('SUZUKI', 'EVERY JOIN Turbo (High Roof) 4WD', '3BD-DA17V'),
  ('SUZUKI', 'EVERY JOIN (high roof) 2WD MT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY JOIN (high roof) 4WD MT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY JOIN (high roof) 2WD CVT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY JOIN (high roof) 4WD CVT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PC (High roof) 2WD 5MT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PC (High roof) 4WD 5MT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PC (High roof) 2WD CVT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PC (High roof) 4WD CVT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PA Limited (High Roof) 2WD 5MT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PA Limited (High Roof) 4WD 5MT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PA Limited (High Roof) 2WD CVT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PA Limited (High Roof) 4WD CVT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PA (High Roof) 2WD 5MT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PA (High Roof) 4WD 5MT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PA (High Roof) 2WD CVT', '3BD-DA17V'),
  ('SUZUKI', 'EVERY PA (High Roof) 4WD CVT', '3BD-DA17V'),
  ('TOYOTA', 'Land Cruiser Prado 150 Petrol TRJ150 TX L Package 7 Seater', '3BA-TRJ150W-GKTEK'),
  ('TOYOTA', 'Land Cruiser Prado 250 Petrol', 'TRJ250W');

-- ============ Vehicles (chassis number is the primary key) ============
create table vehicles (
  chassis_number text primary key,
  supplier_id uuid not null references suppliers (id),
  model_id uuid not null references vehicle_models (id),
  year int,
  color text,
  target_listing_price numeric(15, 2) not null default 0,
  auction_price numeric(15, 2),
  auction_price_currency text not null default 'LKR',
  cif_price numeric(15, 2),
  cif_price_currency text not null default 'LKR',
  purchase_date date, -- "Auction purchase date" in the UI
  lc_open_date date,
  landed_date date,
  cleared_date date,
  spare_key_status spare_key_status_t not null default 'PENDING',
  vehicle_status vehicle_status_t not null default 'BOUGHT_NOT_RECEIVED',
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Vehicle photos (multiple per vehicle) ============
create table vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  chassis_number text not null references vehicles (chassis_number) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- ============ Vehicle documents (any file type — permits, bills of lading, registration, etc.) ============
create table vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  chassis_number text not null references vehicles (chassis_number) on delete cascade,
  storage_path text not null,
  file_name text not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Cash transfers (the unified money-movement ledger) ============
-- Every transfer moves money from one cash entity to another. Vehicle/overhead
-- expenses, supplier deposits/refunds, and capital injections are all just
-- transfers with different source/destination entities — see vehicle_expenses,
-- overhead_expenses below, which wrap a transfer with a cost classification.
create table cash_transfers (
  id uuid primary key default gen_random_uuid(),
  source_entity_id uuid not null references cash_entities (id),
  destination_entity_id uuid not null references cash_entities (id),
  amount numeric(15, 2) not null,
  currency text not null default 'LKR',
  exchange_rate_to_lkr numeric(12, 6) not null default 1,
  amount_lkr numeric(15, 2) generated always as (round(amount * exchange_rate_to_lkr, 2)) stored,
  transfer_date date not null default current_date,
  method transfer_method not null default 'OTHER',
  purpose text,
  notes text,
  bank_reference text,
  receipt_path text,
  lc_document_path text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check (source_entity_id <> destination_entity_id)
);

create or replace function enforce_cash_entity_category()
returns trigger as $$
declare
  source_category cash_entity_category;
begin
  select category into source_category from cash_entities where id = new.source_entity_id;

  if source_category = 'CASH_ENTITY' then
    raise exception 'This entity can only receive money — it can''t be used as a source.';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists on_cash_transfer_direction_check on cash_transfers; -- from an earlier version of this schema
drop trigger if exists on_cash_transfer_category_check on cash_transfers;
create trigger on_cash_transfer_category_check
  before insert or update on cash_transfers
  for each row execute procedure enforce_cash_entity_category();

-- ============ Dynamic cost ledger (wraps a cash transfer with a vehicle + cost head) ============
create table vehicle_expenses (
  id uuid primary key default gen_random_uuid(),
  chassis_number text not null references vehicles (chassis_number) on delete cascade,
  cost_head_id uuid not null references cost_heads (id),
  cash_transfer_id uuid not null unique references cash_transfers (id) on delete cascade,
  remarks text,
  created_at timestamptz not null default now()
);

-- ============ Overhead expenses (wraps a cash transfer with a category, not tied to a vehicle) ============
create table overhead_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into overhead_categories (name) values
  ('Showroom Maintenance'),
  ('Advertisement'),
  ('Rent'),
  ('Utilities & Bills'),
  ('Other');

create table overhead_expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references overhead_categories (id),
  cash_transfer_id uuid not null unique references cash_transfers (id) on delete cascade,
  remarks text,
  created_at timestamptz not null default now()
);

-- ============ Business resources (external reference links) ============
create table resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  description text,
  logo_path text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

insert into resources (title, url, description) values
  ('Japan Auction (JP Center)', 'https://jpcenter.ru/', 'Japan vehicle auction search/listings'),
  ('Vehicle Shipping Schedules', 'https://autocj.co.jp/japan_shipping?dest=8', 'AutoCJ shipping schedule to Sri Lanka'),
  ('Bank of Ceylon Exchange Rates', 'https://www.boc.lk/rates-tariff', 'BOC daily exchange rates and tariffs'),
  ('Sri Lanka Customs Exchange Rates', 'https://www.customs.gov.lk/exchange-rates/', 'Official customs exchange rates for duty calculation');

-- ============ Customers ============
create table customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  nic_passport text not null unique,
  phone text not null,
  address text,
  email text,
  created_at timestamptz not null default now()
);

-- ============ Sales & financing ============
create table sales (
  id uuid primary key default gen_random_uuid(),
  chassis_number text not null unique references vehicles (chassis_number),
  customer_id uuid not null references customers (id),
  agreed_sale_price numeric(15, 2) not null,
  payment_type payment_type_t not null,
  leasing_company_id uuid references cash_entities (id),
  leasing_amount_approved numeric(15, 2) not null default 0,
  leasing_status leasing_status_t not null default 'NOT_APPLICABLE',
  release_order_status text,
  sale_date date not null default current_date,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Sale receipts (individual payment/disbursal history) ============
create table sale_receipts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id) on delete cascade,
  amount numeric(15, 2) not null,
  payment_method receipt_method not null,
  -- Only set for LEASING_DISBURSAL receipts, linking to the Leasing Company -> bank/account
  -- transfer this receipt represents. Advance/Direct Cash receipts don't touch the ledger.
  cash_transfer_id uuid references cash_transfers (id) on delete cascade,
  received_date date not null default current_date,
  reference text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Invoices (printable document per recorded receipt) ============
-- One invoice per receipt; invoiced_amount is independently editable from the receipt's
-- actual amount collected. chassis_number is denormalized here (not just reachable via
-- sale_receipt -> sale) so invoices are directly queryable/linked from the vehicle page.
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no bigint generated always as identity,
  sale_receipt_id uuid not null unique references sale_receipts (id) on delete cascade,
  chassis_number text not null references vehicles (chassis_number),
  invoiced_amount numeric(15, 2) not null,
  issue_date date not null default current_date,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Chassis-number -> manufacture-year lookup (seeded from official JAMA reference tables) ============
-- One row per contiguous serial-number range for a given chassis code + year. A chassis code with
-- multiple disjoint ranges in one year's table becomes multiple rows. `makes` is an informational
-- comma-list (e.g. "Toyota, Subaru"), not a lookup key -- chassis-code formats are manufacturer-specific
-- and cross-manufacturer collisions are not a real concern here. Regulatory reference data, reseeded
-- wholesale from a new PDF pass each year rather than hand-maintained row by row.
create table chassis_year_ranges (
  id uuid primary key default gen_random_uuid(),
  chassis_code text not null,
  year int not null,
  range_start bigint not null,
  range_end bigint not null,
  makes text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index chassis_year_ranges_code_idx on chassis_year_ranges (chassis_code);

insert into chassis_year_ranges (chassis_code, year, range_start, range_end, makes, notes) values
('XEAM10', 2023, 1305, 1983, 'Subaru, Toyota', 'shared common sequence'),
('YEAM15', 2023, 1505, 2493, 'Subaru, Toyota', 'shared common sequence'),
('FJA300', 2023, 4038669, 4076246, 'Toyota', null),
('VJA300', 2023, 4067906, 4131712, 'Toyota', null),
('VJA310', 2023, 4016155, 4045404, 'Lexus', null),
('KMA10', 2023, 2013181, 2015872, 'Lexus', null),
('MXAA52', 2023, 4007690, 4008077, 'Toyota', null),
('MXAA52', 2023, 5005874, 5006921, 'Toyota', null),
('MXAA54', 2023, 2036865, 2038979, 'Toyota', null),
('MXAA54', 2023, 4036922, 4044093, 'Toyota', null),
('MXAA54', 2023, 5038627, 5048022, 'Toyota', null),
('AXAH52', 2023, 4008490, 4009572, 'Toyota', null),
('AXAH52', 2023, 5002011, 5002055, 'Toyota', null),
('AXAH54', 2023, 2012652, 2014714, 'Toyota', null),
('AXAH54', 2023, 4044150, 4055406, 'Toyota', null),
('AXAH54', 2023, 5004085, 5006969, 'Toyota', null),
('AXAP54', 2023, 8348, 11184, 'Toyota', null),
('MZAA10', 2023, 2059202, 2064032, 'Lexus', null),
('MZAH10', 2023, 2146125, 2193761, 'Lexus', null),
('MZAH11', 2023, 3000000, 3000000, 'Lexus', null),
('MZAH15', 2023, 2067685, 2080629, 'Lexus', null),
('MZAH16', 2023, 3000000, 3000002, 'Lexus', null),
('GDB60', 2023, 10000, 10090, 'Toyota, Hino', 'shared common sequence'),
('GDB60', 2023, 50000, 50001, 'Toyota, Hino', 'shared common sequence'),
('GDB60', 2023, 100000, 100349, 'Toyota, Hino', 'shared common sequence'),
('GDB60', 2023, 1000000, 1000086, 'Toyota, Hino', 'shared common sequence'),
('GDB70', 2023, 10000, 10159, 'Toyota, Hino', 'shared common sequence'),
('GDB70', 2023, 50000, 50007, 'Toyota, Hino', 'shared common sequence'),
('GDB70', 2023, 100002, 100742, 'Toyota, Hino', 'shared common sequence'),
('GDB70', 2023, 1000000, 1000014, 'Toyota, Hino', 'shared common sequence'),
('GDB80', 2023, 10000, 10000, 'Toyota, Hino', 'shared common sequence'),
('GDB80', 2023, 1000000, 1000001, 'Toyota, Hino', 'shared common sequence'),
('XEBM10', 2023, 1001, 1122, 'Lexus', null),
('XEBM15', 2023, 1032, 2531, 'Lexus', null),
('ASC10', 2023, 6002771, 6002971, 'Lexus', null),
('GSC10', 2023, 6002316, 6002502, 'Lexus', null),
('USC10', 2023, 6002962, 6003214, 'Lexus', null),
('AVC10', 2023, 6007277, 6007791, 'Lexus', null),
('JPD20', 2023, 4599, 4867, 'Toyota', null),
('NKE165', 2023, 7267002, 7278881, 'Toyota', 'shared common sequence'),
('NRE161', 2023, 108273, 113307, 'Toyota', 'shared common sequence'),
('ASE30', 2023, 13156, 14316, 'Lexus', null),
('GSE31', 2023, 5063015, 5075196, 'Lexus', null),
('USE30', 2023, 1349, 2989, 'Lexus', null),
('AVE30', 2023, 5095653, 5100079, 'Lexus', null),
('AVE35', 2023, 3993, 4511, 'Lexus', null),
('ZWE215', 2023, 3282, 13682, 'Toyota', 'shared common sequence'),
('ZWE219', 2023, 9154, 44055, 'Toyota', 'shared common sequence'),
('ZWE219', 2023, 4002465, 4010256, 'Toyota', 'shared common sequence'),
('NZE161', 2023, 7136369, 7138284, 'Toyota', 'shared common sequence'),
('NZE164', 2023, 7091656, 7095167, 'Toyota', 'shared common sequence'),
('GZEA14', 2023, 1038, 2046, 'Toyota', null),
('MZEA12', 2023, 4000434, 4002745, 'Toyota', null),
('MZEA17', 2023, 3322, 11705, 'Toyota', 'shared common sequence'),
('GVF50', 2023, 6008511, 6009247, 'Lexus', null),
('GVF55', 2023, 6008190, 6008959, 'Lexus', null),
('VXFA50', 2023, 6007669, 6008105, 'Lexus', null),
('VXFA55', 2023, 6001786, 6001914, 'Lexus', null),
('GRG75', 2023, 1001, 1121, 'Toyota', null),
('GRG75', 2023, 1000002, 1000003, 'Toyota', null),
('ZSG10', 2023, 1014758, 1029499, 'Toyota', null),
('ZVG11', 2023, 1050947, 1081010, 'Toyota', null),
('ZVG13', 2023, 1000001, 1009258, 'Toyota', null),
('ZVG15', 2023, 1015666, 1024519, 'Toyota', null),
('ZVG16', 2023, 1000001, 1003061, 'Toyota', null),
('UWG60', 2023, 1000232, 1000350, 'Toyota', null),
('MXGA10', 2023, 1000001, 1001224, 'Toyota', null),
('TAHA40', 2023, 1001, 4085, 'Toyota', null),
('TAHA45', 2023, 1001, 1926, 'Toyota', null),
('AAHH40', 2023, 1001, 15495, 'Toyota', null),
('AAHH40', 2023, 4000000, 4001374, 'Toyota', null),
('AAHH45', 2023, 1001, 12631, 'Toyota', null),
('GDH201', 2023, 1088812, 1100700, 'Toyota, Mazda', 'shared common sequence'),
('GDH201', 2023, 2033017, 2041166, 'Toyota, Mazda', 'shared common sequence'),
('GDH201', 2023, 2900155, 2900298, 'Toyota, Mazda', 'shared common sequence'),
('GDH206', 2023, 1085448, 1100510, 'Toyota, Mazda', 'shared common sequence'),
('GDH206', 2023, 2027994, 2037250, 'Toyota, Mazda', 'shared common sequence'),
('GDH206', 2023, 2900786, 2901011, 'Toyota, Mazda', 'shared common sequence'),
('GDH211', 2023, 1009049, 1010753, 'Toyota', null),
('GDH221', 2023, 2003527, 2004259, 'Toyota', null),
('GDH223', 2023, 2005120, 2006813, 'Toyota', null),
('GDH226', 2023, 2006070, 2007680, 'Toyota', null),
('GDH303', 2023, 1002210, 1002887, 'Toyota', null),
('AGH30', 2023, 448559, 464720, 'Toyota', null),
('AGH35', 2023, 57404, 58196, 'Toyota', null),
('GGH30', 2023, 44603, 44900, 'Toyota', null),
('GGH35', 2023, 13818, 13965, 'Toyota', null),
('AGH40', 2023, 1001, 16470, 'Toyota', null),
('AGH40', 2023, 4000000, 4001195, 'Toyota', null),
('AGH45', 2023, 1001, 2895, 'Toyota', null),
('TRH200', 2023, 369137, 382968, 'Toyota, Mazda', 'shared common sequence'),
('TRH200', 2023, 5057310, 5064615, 'Toyota, Mazda', 'shared common sequence'),
('TRH200', 2023, 9001171, 9001399, 'Toyota, Mazda', 'shared common sequence'),
('TRH211', 2023, 8011371, 8011914, 'Toyota', null),
('TRH214', 2023, 72973, 77629, 'Toyota', null),
('TRH216', 2023, 8015002, 8016636, 'Toyota', null),
('TRH219', 2023, 43359, 47179, 'Toyota', null),
('TRH221', 2023, 102881, 104689, 'Toyota', 'shared common sequence'),
('TRH223', 2023, 6209167, 6210175, 'Toyota', null),
('TRH224', 2023, 24261, 25682, 'Toyota', null),
('TRH226', 2023, 25414, 26952, 'Toyota', 'shared common sequence'),
('TRH228', 2023, 12241, 12767, 'Toyota', null),
('TRH229', 2023, 15689, 16790, 'Toyota', null),
('AYH30', 2023, 153571, 157577, 'Toyota', null),
('GDJ150', 2023, 80515, 91154, 'Toyota', null),
('GDJ151', 2023, 13173, 14262, 'Toyota', null),
('GDJ76', 2023, 1001002, 1001972, 'Toyota', null),
('TRJ150', 2023, 159222, 179851, 'Toyota', null),
('TALA10', 2023, 1000010, 1000817, 'Lexus', null),
('TALA15', 2023, 1000200, 1005720, 'Lexus', null),
('AALH10', 2023, 1000004, 1001865, 'Lexus', null),
('AALH15', 2023, 1000011, 1000999, 'Lexus', null),
('AALH16', 2023, 1000234, 1003683, 'Lexus', null),
('TALH17', 2023, 1000217, 1010011, 'Lexus', null),
('MUM1NA', 2023, 40146, 40171, 'Toyota', null),
('NCP160', 2023, 179678, 188184, 'Toyota, Mazda', 'shared common sequence'),
('NCP160', 2023, 7005025, 7005753, 'Toyota, Mazda', 'shared common sequence'),
('NCP165', 2023, 107422, 120249, 'Toyota, Mazda', 'shared common sequence'),
('NCP165', 2023, 7001465, 7001808, 'Toyota, Mazda', 'shared common sequence'),
('NHP160', 2023, 69734, 97071, 'Toyota, Mazda', 'shared common sequence'),
('NHP160', 2023, 7000173, 7000725, 'Toyota, Mazda', 'shared common sequence'),
('NSP160', 2023, 71391, 76769, 'Toyota', null),
('KSP210', 2023, 89744, 115430, 'Toyota', null),
('NTP10', 2023, 2008368, 2016261, 'Toyota', null),
('GXPA16', 2023, 11213, 13292, 'Toyota', null),
('MXPA10', 2023, 2063428, 2077430, 'Toyota', null),
('MXPA12', 2023, 5303, 5556, 'Toyota', null),
('MXPA15', 2023, 18750, 24646, 'Toyota', null),
('MXPB10', 2023, 2026104, 2027950, 'Toyota', null),
('MXPB10', 2023, 3028134, 3042879, 'Toyota', null),
('MXPB15', 2023, 2004918, 2004972, 'Toyota', null),
('MXPB15', 2023, 3010279, 3015031, 'Toyota', null),
('MXPC10', 2023, 1016762, 1038727, 'Toyota', null),
('MXPC12', 2023, 1000501, 1001591, 'Toyota', null),
('MXPH10', 2023, 2120334, 2157051, 'Toyota', null),
('MXPH14', 2023, 1001, 1004, 'Toyota', null),
('MXPH15', 2023, 19732, 26492, 'Toyota', null),
('MXPH17', 2023, 1001, 1001, 'Toyota', null),
('MXPJ10', 2023, 2054470, 2058768, 'Toyota', null),
('MXPJ10', 2023, 3067023, 3126935, 'Toyota', null),
('MXPJ15', 2023, 2010252, 2010383, 'Toyota', null),
('MXPJ15', 2023, 3024882, 3040837, 'Toyota', null),
('MXPK10', 2023, 2005223, 2009185, 'Toyota', null),
('MXPK11', 2023, 2104449, 2169276, 'Toyota', null),
('MXPK15', 2023, 2000555, 2001100, 'Toyota', null),
('MXPK16', 2023, 2016380, 2025851, 'Toyota', null),
('MXPL10', 2023, 1028109, 1116773, 'Toyota', null),
('MXPL12', 2023, 1000255, 1001484, 'Toyota', null),
('MXPL15', 2023, 1005582, 1022764, 'Toyota', null),
('ZWR90', 2023, 58180, 165562, 'Toyota, Suzuki', 'shared common sequence'),
('ZWR90', 2023, 8003204, 8003206, 'Toyota, Suzuki', 'shared common sequence'),
('ZWR90', 2023, 9000609, 9001073, 'Toyota, Suzuki', 'shared common sequence'),
('ZWR92', 2023, 1322, 2034, 'Toyota', null),
('ZWR95', 2023, 14023, 32037, 'Toyota, Suzuki', 'shared common sequence'),
('ZWR95', 2023, 9000223, 9000349, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA90', 2023, 38667, 86901, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA90', 2023, 9000256, 9000493, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA92', 2023, 2415, 4368, 'Toyota', null),
('MZRA95', 2023, 8714, 17417, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA95', 2023, 9000079, 9000183, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA97', 2023, 1326, 1726, 'Toyota', null),
('ARS220', 2023, 1006548, 1006642, 'Toyota', null),
('AZSH21', 2023, 1018219, 1019067, 'Toyota', null),
('AZSH32', 2023, 1001, 1873, 'Toyota', null),
('AZSH35', 2023, 4005920, 4017534, 'Toyota', null),
('AZSH35', 2023, 6003074, 6021315, 'Toyota', null),
('AZSH36', 2023, 4000000, 4006552, 'Toyota', null),
('AZSH37', 2023, 4000000, 4000052, 'Toyota', null),
('TZSH35', 2023, 4002668, 4005473, 'Toyota', null),
('TZSH35', 2023, 6000939, 6005103, 'Toyota', null),
('KZSM30', 2023, 1001, 1162, 'Toyota', null),
('MXUA80', 2023, 83114, 109426, 'Toyota', null),
('MXUA85', 2023, 12374, 16023, 'Toyota', null),
('AXUH80', 2023, 51258, 85577, 'Toyota', null),
('AXUH85', 2023, 21932, 33394, 'Toyota', null),
('AXUP85', 2023, 1341, 5910, 'Toyota', null),
('RMV11', 2023, 1000079, 1000114, 'Toyota', null),
('RMV12', 2023, 1001876, 1002271, 'Toyota', null),
('AXVH70', 2023, 1083273, 1091153, 'Daihatsu, Toyota', 'shared common sequence'),
('AXVH75', 2023, 1004965, 1006445, 'Daihatsu, Toyota', 'shared common sequence'),
('AAWH10', 2023, 1001, 1002, 'Lexus', null),
('AAWH15', 2023, 1001, 1008, 'Lexus', null),
('TAWH15', 2023, 1001, 1200, 'Lexus', null),
('ZVW60', 2023, 4000017, 4022415, 'Toyota', null),
('ZVW65', 2023, 4000019, 4003558, 'Toyota', null),
('MXWH60', 2023, 4000370, 4058989, 'Toyota', null),
('MXWH61', 2023, 4000013, 4009671, 'Toyota', null),
('MXWH65', 2023, 4000209, 4012665, 'Toyota', null),
('NGX10', 2023, 2022525, 2024372, 'Toyota', null),
('NGX50', 2023, 2041286, 2042007, 'Toyota', null),
('ZYX11', 2023, 2058333, 2063311, 'Toyota', null),
('MAYH10', 2023, 2000000, 2000514, 'Lexus', null),
('MAYH15', 2023, 2000000, 2000199, 'Lexus', null),
('AAZA20', 2023, 1002035, 1004644, 'Lexus', null),
('AAZA20', 2023, 6000872, 6003226, 'Lexus', null),
('AAZA25', 2023, 1001159, 1001343, 'Lexus', null),
('AAZA25', 2023, 6000150, 6000800, 'Lexus', null),
('TAZA25', 2023, 1002387, 1003288, 'Lexus', null),
('TAZA25', 2023, 6000732, 6001726, 'Lexus', null),
('AAZH20', 2023, 1004070, 1016236, 'Lexus', null),
('AAZH20', 2023, 6002337, 6011055, 'Lexus', null),
('AAZH25', 2023, 1002706, 1005046, 'Lexus', null),
('AAZH25', 2023, 6001064, 6008072, 'Lexus', null),
('AAZH26', 2023, 1003495, 1007869, 'Lexus', null),
('URZ100', 2023, 6800, 8079, 'Lexus', null),
('GWZ100', 2023, 3166, 3319, 'Lexus', null),
('AXZH11', 2023, 1010703, 1014709, 'Lexus', null),
('GUN125', 2023, 3944171, 3954223, 'TMT', null),
('XEAM10', 2024, 1984, 2646, 'Subaru, Toyota', 'shared common sequence'),
('YEAM15', 2024, 2494, 2838, 'Subaru, Toyota', 'shared common sequence'),
('VJA252', 2024, 1001, 1128, 'Lexus', null),
('FJA300', 2024, 4076258, 4098194, 'Toyota', null),
('VJA300', 2024, 4131644, 4176785, 'Toyota', null),
('VJA310', 2024, 4045345, 4068139, 'Lexus', null),
('KMA10', 2024, 2015933, 2016996, 'Lexus', null),
('MXAA52', 2024, 4008078, 4008526, 'Toyota', null),
('MXAA52', 2024, 5006922, 5007290, 'Toyota', null),
('MXAA54', 2024, 2038980, 2041161, 'Toyota', null),
('MXAA54', 2024, 4044094, 4049840, 'Toyota', null),
('MXAA54', 2024, 5048023, 5051059, 'Toyota', null),
('AXAH52', 2024, 4009573, 4009953, 'Toyota', null),
('AXAH52', 2024, 5002056, 5002637, 'Toyota', null),
('AXAH54', 2024, 2014715, 2017092, 'Toyota', null),
('AXAH54', 2024, 4055407, 4060885, 'Toyota', null),
('AXAH54', 2024, 5006963, 5014797, 'Toyota', null),
('AXAP54', 2024, 11185, 12422, 'Toyota', null),
('MZAH10', 2024, 2193745, 2193763, 'Lexus', null),
('MZAH11', 2024, 3000001, 3004352, 'Lexus', null),
('MZAH16', 2024, 3000003, 3001205, 'Lexus', null),
('GDB60', 2024, 10091, 10173, 'Toyota, Hino', 'shared common sequence'),
('GDB60', 2024, 50002, 50003, 'Toyota, Hino', 'shared common sequence'),
('GDB60', 2024, 100342, 100654, 'Toyota, Hino', 'shared common sequence'),
('GDB60', 2024, 1000087, 1000167, 'Toyota, Hino', 'shared common sequence'),
('GDB70', 2024, 10160, 10500, 'Toyota, Hino', 'shared common sequence'),
('GDB70', 2024, 50008, 50010, 'Toyota, Hino', 'shared common sequence'),
('GDB70', 2024, 100743, 101727, 'Toyota, Hino', 'shared common sequence'),
('GDB70', 2024, 1000015, 1000034, 'Toyota, Hino', 'shared common sequence'),
('GDB80', 2024, 1000002, 1000012, 'Toyota, Hino', 'shared common sequence'),
('XEBM10', 2024, 1116, 1318, 'Lexus', null),
('XEBM15', 2024, 2532, 2833, 'Lexus', null),
('ASC10', 2024, 6002972, 6003064, 'Lexus', null),
('GSC10', 2024, 6002503, 6002597, 'Lexus', null),
('USC10', 2024, 6003215, 6003381, 'Lexus', null),
('AVC10', 2024, 6007792, 6008089, 'Lexus', null),
('JPD20', 2024, 4868, 4950, 'Toyota', null),
('NKE165', 2024, 7278882, 7289353, 'Toyota', 'shared common sequence'),
('NRE161', 2024, 113306, 116912, 'Toyota', 'shared common sequence'),
('ASE30', 2024, 14317, 14970, 'Lexus', null),
('GSE31', 2024, 5075261, 5081297, 'Lexus', null),
('USE30', 2024, 2990, 4080, 'Lexus', null),
('AVE30', 2024, 5100080, 5102062, 'Lexus', null),
('AVE35', 2024, 4512, 4757, 'Lexus', null),
('ZWE215', 2024, 13223, 24575, 'Toyota', 'shared common sequence'),
('ZWE219', 2024, 43998, 84618, 'Toyota', 'shared common sequence'),
('ZWE219', 2024, 4010254, 4016859, 'Toyota', 'shared common sequence'),
('NZE161', 2024, 7138285, 7139759, 'Toyota', 'shared common sequence'),
('NZE164', 2024, 7095168, 7098015, 'Toyota', 'shared common sequence'),
('GZEA14', 2024, 2047, 2581, 'Toyota', null),
('MZEA12', 2024, 4002746, 4004453, 'Toyota', null),
('MZEA17', 2024, 11200, 18521, 'Toyota', 'shared common sequence'),
('GVF50', 2024, 6009248, 6009718, 'Lexus', null),
('GVF55', 2024, 6008958, 6009482, 'Lexus', null),
('VXFA50', 2024, 6008103, 6008333, 'Lexus', null),
('VXFA55', 2024, 6001915, 6001977, 'Lexus', null),
('GRG75', 2024, 1116, 1390, 'Toyota', null),
('ZVG13', 2024, 1009182, 1068562, 'Toyota', null),
('ZVG16', 2024, 1002609, 1020045, 'Toyota', null),
('UWG60', 2024, 1000351, 1000451, 'Toyota', null),
('MXGA10', 2024, 1001225, 1007513, 'Toyota', null),
('TAHA40', 2024, 4080, 10506, 'Toyota', null),
('TAHA45', 2024, 1922, 3803, 'Toyota', null),
('AAHH40', 2024, 15454, 34365, 'Toyota', null),
('AAHH40', 2024, 4001282, 4024705, 'Toyota', null),
('AAHH45', 2024, 12504, 37383, 'Toyota', null),
('GDH201', 2024, 1100686, 1110562, 'Toyota, Mazda', 'shared common sequence'),
('GDH201', 2024, 2041167, 2044501, 'Toyota, Mazda', 'shared common sequence'),
('GDH201', 2024, 2900299, 2900360, 'Toyota, Mazda', 'shared common sequence'),
('GDH206', 2024, 1100477, 1111204, 'Toyota, Mazda', 'shared common sequence'),
('GDH206', 2024, 2037211, 2039866, 'Toyota, Mazda', 'shared common sequence'),
('GDH206', 2024, 2901012, 2901118, 'Toyota, Mazda', 'shared common sequence'),
('GDH211', 2024, 1010754, 1011459, 'Toyota', null),
('GDH221', 2024, 2004260, 2004551, 'Toyota', null),
('GDH223', 2024, 2006814, 2008374, 'Toyota', null),
('GDH226', 2024, 2007681, 2008314, 'Toyota', null),
('GDH303', 2024, 1002888, 1003033, 'Toyota', null),
('AGH40', 2024, 16419, 32074, 'Toyota', null),
('AGH40', 2024, 4001048, 4020377, 'Toyota', null),
('AGH45', 2024, 2891, 7127, 'Toyota', null),
('AGH45', 2024, 4000101, 4000133, 'Toyota', null),
('TRH200', 2024, 382923, 391481, 'Toyota, Mazda', 'shared common sequence'),
('TRH200', 2024, 5064548, 5066223, 'Toyota, Mazda', 'shared common sequence'),
('TRH200', 2024, 9001400, 9001543, 'Toyota, Mazda', 'shared common sequence'),
('TRH211', 2024, 8011915, 8012096, 'Toyota', null),
('TRH214', 2024, 77622, 79702, 'Toyota', null),
('TRH216', 2024, 8016637, 8017288, 'Toyota', null),
('TRH219', 2024, 47180, 48778, 'Toyota', null),
('TRH221', 2024, 104702, 105364, 'Toyota', 'shared common sequence'),
('TRH223', 2024, 6210177, 6210881, 'Toyota', null),
('TRH224', 2024, 25683, 26376, 'Toyota', null),
('TRH226', 2024, 26950, 27772, 'Toyota', 'shared common sequence'),
('TRH228', 2024, 12768, 13055, 'Toyota', null),
('TRH229', 2024, 16791, 17437, 'Toyota', null),
('GDJ250', 2024, 1001, 17055, 'Toyota', null),
('GDJ250', 2024, 4000000, 4003038, 'Toyota', null),
('GDJ76', 2024, 1001971, 1006474, 'Toyota', null),
('TRJ250', 2024, 1001, 19830, 'Toyota', null),
('TALA10', 2024, 1000818, 1001446, 'Lexus', null),
('TALA15', 2024, 1005362, 1009751, 'Lexus', null),
('AALH10', 2024, 1001866, 1004089, 'Lexus', null),
('AALH15', 2024, 1001000, 1002206, 'Lexus', null),
('AALH16', 2024, 1003644, 1005731, 'Lexus', null),
('TALH17', 2024, 1009961, 1015781, 'Lexus', null),
('MUM1NA', 2024, 40172, 40187, 'Toyota', null),
('NCP160', 2024, 188175, 196133, 'Toyota, Mazda', 'shared common sequence'),
('NCP160', 2024, 7005754, 7006264, 'Toyota, Mazda', 'shared common sequence'),
('NCP165', 2024, 120236, 132743, 'Toyota, Mazda', 'shared common sequence'),
('NCP165', 2024, 7001809, 7002169, 'Toyota, Mazda', 'shared common sequence'),
('NHP160', 2024, 96710, 126452, 'Toyota, Mazda', 'shared common sequence'),
('NHP160', 2024, 7000726, 7001424, 'Toyota, Mazda', 'shared common sequence'),
('NSP160', 2024, 76770, 81110, 'Toyota', null),
('KSP210', 2024, 114928, 139390, 'Toyota', null),
('NTP10', 2024, 2016248, 2022703, 'Toyota', null),
('GXPA16', 2024, 13212, 17185, 'Toyota', null),
('MXPA10', 2024, 2077416, 2086887, 'Toyota', null),
('MXPA15', 2024, 24539, 29792, 'Toyota', null),
('MXPB10', 2024, 2027894, 2029301, 'Toyota', null),
('MXPB10', 2024, 3042813, 3052118, 'Toyota', null),
('MXPB15', 2024, 3014996, 3018274, 'Toyota', null),
('MXPC10', 2024, 1038720, 1059541, 'Toyota', null),
('MXPC12', 2024, 1001592, 1002694, 'Toyota', null),
('MXPH10', 2024, 2157036, 2157909, 'Toyota', null),
('MXPH14', 2024, 1005, 36654, 'Toyota', null),
('MXPH15', 2024, 26493, 26596, 'Toyota', null),
('MXPH17', 2024, 1002, 6474, 'Toyota', null),
('MXPJ10', 2024, 2058617, 2071707, 'Toyota', null),
('MXPJ10', 2024, 3124514, 3169334, 'Toyota', null),
('MXPJ15', 2024, 3040838, 3052377, 'Toyota', null),
('MXPK10', 2024, 2009186, 2009739, 'Toyota', null),
('MXPK11', 2024, 2169242, 2225173, 'Toyota', null),
('MXPK15', 2024, 2001101, 2001202, 'Toyota', null),
('MXPK16', 2024, 2025852, 2033986, 'Toyota', null),
('MXPL10', 2024, 1116734, 1186749, 'Toyota', null),
('MXPL12', 2024, 1001485, 1002770, 'Toyota', null),
('MXPL15', 2024, 1022743, 1037021, 'Toyota', null),
('ZWR90', 2024, 165371, 230902, 'Toyota, Suzuki', 'shared common sequence'),
('ZWR90', 2024, 8003207, 8013145, 'Toyota, Suzuki', 'shared common sequence'),
('ZWR90', 2024, 9001074, 9001817, 'Toyota, Suzuki', 'shared common sequence'),
('ZWR92', 2024, 2033, 2588, 'Toyota', null),
('ZWR95', 2024, 32033, 45745, 'Toyota, Suzuki', 'shared common sequence'),
('ZWR95', 2024, 9000350, 9000554, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA90', 2024, 86890, 126711, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA90', 2024, 9000494, 9000681, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA92', 2024, 4369, 6309, 'Toyota', null),
('MZRA95', 2024, 17418, 24268, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA95', 2024, 9000184, 9000264, 'Toyota, Suzuki', 'shared common sequence'),
('MZRA97', 2024, 1727, 2096, 'Toyota', null),
('ARS220', 2024, 1006624, 1006737, 'Toyota', null),
('AZSH21', 2024, 1019068, 1019471, 'Toyota', null),
('AZSH32', 2024, 1809, 11280, 'Toyota', null),
('AZSH35', 2024, 4017532, 4024602, 'Toyota', null),
('AZSH35', 2024, 6021193, 6028107, 'Toyota', null),
('AZSH36', 2024, 4006508, 4038983, 'Toyota', null),
('AZSH37', 2024, 4000037, 4003930, 'Toyota', null),
('TZSH35', 2024, 4005474, 4006555, 'Toyota', null),
('TZSH35', 2024, 6005045, 6005815, 'Toyota', null),
('KZSM30', 2024, 1136, 1733, 'Toyota', null),
('MXUA80', 2024, 109407, 130186, 'Toyota', null),
('MXUA85', 2024, 16024, 18934, 'Toyota', null),
('AXUH80', 2024, 85539, 112710, 'Toyota', null),
('AXUH85', 2024, 33377, 41805, 'Toyota', null),
('AXUP85', 2024, 5903, 7177, 'Toyota', null),
('RMV11', 2024, 1000115, 1000135, 'Toyota', null),
('RMV12', 2024, 1002272, 1002446, 'Toyota', null),
('AXVH70', 2024, 1091151, 1091169, 'Toyota', null),
('AXVH75', 2024, 1006446, 1006448, 'Toyota', null),
('TAWH15', 2024, 1201, 7618, 'Lexus', null),
('ZVW60', 2024, 4022409, 4034504, 'Toyota', null),
('ZVW65', 2024, 4003559, 4005694, 'Toyota', null),
('MXWH60', 2024, 4058864, 4108294, 'Toyota', null),
('MXWH61', 2024, 4009672, 4019236, 'Toyota', null),
('MXWH65', 2024, 4012651, 4021574, 'Toyota', null),
('GAYA16', 2024, 1001, 1916, 'Lexus', null),
('MAYH10', 2024, 2000504, 2017673, 'Lexus', null),
('MAYH15', 2024, 2000189, 2004334, 'Lexus', null),
('AAZA20', 2024, 1004645, 1006627, 'Lexus', null),
('AAZA20', 2024, 6003227, 6003526, 'Lexus', null),
('AAZA25', 2024, 1001344, 1001573, 'Lexus', null),
('AAZA25', 2024, 6000801, 6000892, 'Lexus', null),
('TAZA25', 2024, 1003289, 1003581, 'Lexus', null),
('TAZA25', 2024, 6001725, 6002118, 'Lexus', null),
('AAZH20', 2024, 1016152, 1027167, 'Lexus', null),
('AAZH20', 2024, 6011039, 6012935, 'Lexus', null),
('AAZH25', 2024, 1005047, 1008890, 'Lexus', null),
('AAZH25', 2024, 6008073, 6009292, 'Lexus', null),
('AAZH26', 2024, 1007867, 1009886, 'Lexus', null),
('URZ100', 2024, 8078, 8568, 'Lexus', null),
('GWZ100', 2024, 3320, 3396, 'Lexus', null),
('AXZH11', 2024, 1014684, 1017333, 'Lexus', null),
('GUN125', 2024, 3953221, 3958021, 'Toyota', null),
('XEAM10', 2025, 2647, 2849, 'Subaru, Toyota', 'shared common sequence'),
('XEAM11', 2025, 1001, 2421, 'Subaru', 'shared common sequence'),
('XEAM11', 2025, 4000002, 4001538, 'Toyota', 'shared common sequence'),
('XEAM15', 2025, 1001, 1843, 'Subaru', 'shared common sequence'),
('XEAM15', 2025, 4000007, 4000805, 'Toyota', 'shared common sequence'),
('YEAM15', 2025, 2839, 3067, 'Subaru, Toyota', 'shared common sequence'),
('VJA252', 2025, 1129, 4730, 'Lexus', null),
('FJA300', 2025, 4110498, 4135897, 'Toyota', null),
('VJA300', 2025, 4188902, 4222754, 'Toyota', null),
('VJA310', 2025, 4074141, 4092888, 'Lexus', null),
('KMA10', 2025, 2017026, 2018565, 'Lexus', null),
('MXAA54', 2025, 2041162, 2043137, 'Toyota', null),
('MXAA54', 2025, 4049841, 4055741, 'Toyota', null),
('MXAA54', 2025, 5051031, 5055289, 'Toyota', null),
('AXAH54', 2025, 2017093, 2019241, 'Toyota', null),
('AXAH54', 2025, 4060886, 4068697, 'Toyota', null),
('AXAH54', 2025, 5014650, 5020265, 'Toyota', null),
('AXAN62', 2025, 3000000, 3000002, 'Toyota', null),
('AXAN64', 2025, 2000000, 2000815, 'Toyota', null),
('AXAN64', 2025, 3000000, 3000622, 'Toyota', null),
('AXAP54', 2025, 12423, 13371, 'Toyota', null),
('MZAH11', 2025, 3004323, 3007862, 'Lexus', null),
('MZAH16', 2025, 3001206, 3002133, 'Lexus', null),
('GDB60', 2025, 10174, 10205, 'Toyota', 'shared common sequence'),
('GDB60', 2025, 50004, 50008, 'Toyota', 'shared common sequence'),
('GDB60', 2025, 100655, 100770, 'Hino', 'shared common sequence'),
('GDB60', 2025, 1000168, 1000173, 'Hino', 'shared common sequence'),
('GDB70', 2025, 10501, 10742, 'Toyota', 'shared common sequence'),
('GDB70', 2025, 50011, 50015, 'Toyota', 'shared common sequence'),
('GDB70', 2025, 101728, 102449, 'Hino', 'shared common sequence'),
('GDB70', 2025, 1000035, 1000037, 'Hino', 'shared common sequence'),
('GDB80', 2025, 10001, 10002, 'Toyota', 'shared common sequence'),
('GDB80', 2025, 1000013, 1000017, 'Hino', 'shared common sequence'),
('XEBM10', 2025, 1319, 1389, 'Lexus', null),
('XEBM20', 2025, 1001, 1047, 'Lexus', null),
('XEBM15', 2025, 2834, 2874, 'Lexus', null),
('XEBM25', 2025, 1001, 1285, 'Lexus', null),
('ASC10', 2025, 6003065, 6003147, 'Lexus', null),
('GSC10', 2025, 6002598, 6002723, 'Lexus', null),
('USC10', 2025, 6003382, 6003586, 'Lexus', null),
('AVC10', 2025, 6008090, 6008345, 'Lexus', null),
('JPD20', 2025, 4957, 5021, 'Toyota', null),
('NKE165', 2025, 7289354, 7299638, 'Toyota', 'shared common sequence'),
('NRE161', 2025, 116911, 120699, 'Toyota', 'shared common sequence'),
('ASE30', 2025, 14971, 15820, 'Lexus', null),
('GSE31', 2025, 5081339, 5094642, 'Lexus', null),
('USE30', 2025, 4081, 5391, 'Lexus', null),
('AVE30', 2025, 5102133, 5104899, 'Lexus', null),
('AVE35', 2025, 4753, 4912, 'Lexus', null),
('ZWE215', 2025, 24574, 28387, 'Toyota', 'shared common sequence'),
('ZWE215', 2025, 5000001, 5005089, 'Toyota', 'shared common sequence'),
('ZWE219', 2025, 84577, 97209, 'Toyota', 'shared common sequence'),
('ZWE219', 2025, 4016729, 4026983, 'Toyota', 'shared common sequence'),
('ZWE219', 2025, 5000001, 5018686, 'Toyota', 'shared common sequence'),
('NZE161', 2025, 7139756, 7142212, 'Toyota', 'shared common sequence'),
('NZE164', 2025, 7098016, 7101271, 'Toyota', 'shared common sequence'),
('GZEA14', 2025, 2582, 5199, 'Toyota', null),
('MZEA12', 2025, 4004454, 4005587, 'Toyota', null),
('MZEA17', 2025, 18515, 21250, 'Toyota', 'shared common sequence'),
('GVF50', 2025, 6009719, 6010185, 'Lexus', null),
('GVF55', 2025, 6009483, 6009931, 'Lexus', null),
('VXFA50', 2025, 6008334, 6008532, 'Lexus', null),
('VXFA55', 2025, 6001978, 6002049, 'Lexus', null),
('GRG75', 2025, 1388, 1616, 'Toyota', null),
('ZVG13', 2025, 1068297, 1084844, 'Toyota', null),
('ZVG13', 2025, 2000000, 2024906, 'Toyota', null),
('ZVG16', 2025, 1020042, 1023763, 'Toyota', null),
('ZVG16', 2025, 2000000, 2006636, 'Toyota', null),
('UWG60', 2025, 1000437, 1000537, 'Toyota', null),
('MXGA10', 2025, 1007511, 1011042, 'Toyota', null),
('MXGH15', 2025, 2000000, 2002049, 'Toyota', null),
('TAHA40', 2025, 10500, 19165, 'Toyota', null),
('TAHA45', 2025, 3804, 5436, 'Toyota', null),
('AAHH40', 2025, 32916, 57040, 'Toyota', null),
('AAHH40', 2025, 4023725, 4046124, 'Toyota', null),
('AAHH45', 2025, 37135, 61253, 'Toyota', null),
('AAHH45', 2025, 1001, 4293, 'Toyota', null),
('GDH201', 2025, 1110563, 1130133, 'Toyota', 'shared common sequence'),
('GDH201', 2025, 2044502, 2048990, 'Toyota', 'shared common sequence'),
('GDH201', 2025, 2900361, 2900481, 'Mazda', 'shared common sequence'),
('GDH206', 2025, 1111205, 1136076, 'Toyota', 'shared common sequence'),
('GDH206', 2025, 2039867, 2043216, 'Toyota', 'shared common sequence'),
('GDH206', 2025, 2901119, 2901328, 'Mazda', 'shared common sequence'),
('GDH211', 2025, 1011460, 1012252, 'Toyota', null),
('GDH221', 2025, 2004552, 2005017, 'Toyota', null),
('GDH223', 2025, 2008375, 2009306, 'Toyota', null),
('GDH226', 2025, 2008315, 2009211, 'Toyota', null),
('AGH40', 2025, 32027, 45519, 'Toyota', null),
('AGH40', 2025, 4020335, 4040889, 'Toyota', null),
('AGH45', 2025, 7128, 11451, 'Toyota', null),
('VJH310', 2025, 4000101, 4013365, 'Lexus', null),
('TRH200', 2025, 391482, 412283, 'Toyota', 'shared common sequence'),
('TRH200', 2025, 5066224, 5068783, 'Toyota', 'shared common sequence'),
('TRH200', 2025, 9001544, 9001720, 'Mazda', 'shared common sequence'),
('TRH211', 2025, 8012097, 8012369, 'Toyota', null),
('TRH214', 2025, 79703, 83471, 'Toyota', null),
('TRH216', 2025, 8017289, 8018170, 'Toyota', null),
('TRH219', 2025, 48779, 52224, 'Toyota', null),
('TRH221', 2025, 108568, 109901, 'Toyota', 'shared common sequence'),
('TRH223', 2025, 6211518, 6212951, 'Toyota', null),
('TRH224', 2025, 26377, 28013, 'Toyota', null),
('TRH226', 2025, 27773, 28848, 'Toyota', 'shared common sequence'),
('TRH228', 2025, 13056, 13530, 'Toyota', null),
('TRH229', 2025, 17438, 19286, 'Toyota', null),
('GDJ250', 2025, 17030, 31586, 'Toyota', null),
('GDJ250', 2025, 4003039, 4003650, 'Toyota', null),
('GDJ76', 2025, 1006452, 1013315, 'Toyota', null),
('TRJ250', 2025, 19755, 33249, 'Toyota', null),
('TALA10', 2025, 1001447, 1001796, 'Lexus', null),
('TALA15', 2025, 1009752, 1016252, 'Lexus', null),
('AALH10', 2025, 1004090, 1006460, 'Lexus', null),
('AALH15', 2025, 1002207, 1004450, 'Lexus', null),
('AALH16', 2025, 1005735, 1007256, 'Lexus', null),
('TALH17', 2025, 1015782, 1022186, 'Lexus', null),
('MUM1NA', 2025, 40188, 40210, 'Toyota', null),
('NCP160', 2025, 196134, 204366, 'Toyota', 'shared common sequence'),
('NCP160', 2025, 7006265, 7006773, 'Mazda', 'shared common sequence'),
('NCP165', 2025, 132744, 147875, 'Toyota', 'shared common sequence'),
('NCP165', 2025, 7002170, 7002492, 'Mazda', 'shared common sequence'),
('NHP160', 2025, 126442, 163271, 'Toyota', 'shared common sequence'),
('NHP160', 2025, 7001425, 7002318, 'Mazda', 'shared common sequence'),
('NSP160', 2025, 81111, 85258, 'Toyota', null),
('KSP210', 2025, 139391, 158938, 'Toyota', null),
('NTP10', 2025, 2022702, 2029853, 'Toyota', null),
('GXPA16', 2025, 16720, 24292, 'Toyota', null),
('MXPA10', 2025, 2086883, 2095006, 'Toyota', null),
('MXPA15', 2025, 29793, 34035, 'Toyota', null),
('MXPB10', 2025, 2029302, 2031969, 'Toyota', null),
('MXPB10', 2025, 3052119, 3062233, 'Toyota', null),
('MXPB15', 2025, 3018275, 3022156, 'Toyota', null),
('MXPC10', 2025, 1059534, 1080537, 'Toyota', null),
('MXPC12', 2025, 1002695, 1003707, 'Toyota', null),
('MXPH14', 2025, 36630, 71067, 'Toyota', null),
('MXPH17', 2025, 6475, 11574, 'Toyota', null),
('MXPJ10', 2025, 2071593, 2088159, 'Toyota', null),
('MXPJ10', 2025, 3169300, 3208034, 'Toyota', null),
('MXPJ15', 2025, 2010384, 2012382, 'Toyota', null),
('MXPJ15', 2025, 3052376, 3063617, 'Toyota', null),
('MXPK11', 2025, 2225002, 2252213, 'Toyota', null),
('MXPK11', 2025, 6002269, 6033176, 'Toyota', null),
('MXPK16', 2025, 2033985, 2038376, 'Toyota', null),
('MXPK16', 2025, 6000003, 6004884, 'Toyota', null),
('MXPL10', 2025, 1186585, 1257479, 'Toyota', null),
('MXPL12', 2025, 1002771, 1003939, 'Toyota', null),
('MXPL15', 2025, 1037022, 1050816, 'Toyota', null),
('ZWR90', 2025, 228724, 315581, 'Toyota', 'shared common sequence'),
('ZWR90', 2025, 8012969, 8028516, 'Suzuki', 'shared common sequence'),
('ZWR90', 2025, 9001805, 9002511, 'Suzuki', 'shared common sequence'),
('ZWR92', 2025, 2554, 3254, 'Toyota', null),
('ZWR95', 2025, 45726, 64281, 'Toyota', 'shared common sequence'),
('ZWR95', 2025, 9000555, 9000826, 'Suzuki', 'shared common sequence'),
('MZRA90', 2025, 126587, 158754, 'Toyota', 'shared common sequence'),
('MZRA90', 2025, 9000682, 9000838, 'Suzuki', 'shared common sequence'),
('MZRA92', 2025, 6306, 8145, 'Toyota', null),
('MZRA95', 2025, 24141, 31128, 'Toyota', 'shared common sequence'),
('MZRA95', 2025, 9000265, 9000330, 'Suzuki', 'shared common sequence'),
('MZRA97', 2025, 2097, 2555, 'Toyota', null),
('ARS220', 2025, 1006738, 1006801, 'Toyota', null),
('AZSH21', 2025, 1019472, 1019590, 'Toyota', null),
('AZSH32', 2025, 11245, 15757, 'Toyota', null),
('AZSH35', 2025, 4024598, 4030503, 'Toyota', null),
('AZSH35', 2025, 6028108, 6031491, 'Toyota', null),
('AZSH36', 2025, 4038895, 4057022, 'Toyota', null),
('AZSH37', 2025, 4003927, 4005738, 'Toyota', null),
('AZSH38', 2025, 4000000, 4017915, 'Toyota', null),
('AZSH39', 2025, 4000000, 4002755, 'Toyota', null),
('TZSH35', 2025, 4006556, 4007278, 'Toyota', null),
('TZSH35', 2025, 6005816, 6006054, 'Toyota', null),
('KZSM30', 2025, 1734, 2095, 'Toyota', null),
('MXUA80', 2025, 130161, 146147, 'Toyota', null),
('MXUA85', 2025, 18935, 21228, 'Toyota', null),
('AXUH80', 2025, 112671, 137705, 'Toyota', null),
('AXUH85', 2025, 41779, 49323, 'Toyota', null),
('AXUP85', 2025, 7178, 8316, 'Toyota', null),
('AAWH15', 2025, 1009, 1011, 'Lexus', null),
('TAWH15', 2025, 7582, 12401, 'Lexus', null),
('ZVW60', 2025, 4034503, 4043392, 'Toyota', null),
('ZVW65', 2025, 4005695, 4007122, 'Toyota', null),
('MXWH60', 2025, 4108117, 4145416, 'Toyota', null),
('MXWH61', 2025, 4019237, 4025935, 'Toyota', null),
('MXWH65', 2025, 4021562, 4027184, 'Toyota', null),
('GAYA16', 2025, 1917, 4628, 'Lexus', null),
('MAYH10', 2025, 2017625, 2032850, 'Lexus', null),
('MAYH15', 2025, 2004331, 2007135, 'Lexus', null),
('AAZA20', 2025, 1006624, 1007868, 'Lexus', null),
('AAZA20', 2025, 6003527, 6003719, 'Lexus', null),
('AAZA25', 2025, 1001574, 1001698, 'Lexus', null),
('AAZA25', 2025, 6000893, 6000960, 'Lexus', null),
('TAZA25', 2025, 1003582, 1004265, 'Lexus', null),
('TAZA25', 2025, 6002119, 6002310, 'Lexus', null),
('AAZH20', 2025, 1027037, 1036819, 'Lexus', null),
('AAZH20', 2025, 6012928, 6017178, 'Lexus', null),
('AAZH25', 2025, 1008882, 1011916, 'Lexus', null),
('AAZH25', 2025, 6009293, 6011569, 'Lexus', null),
('AAZH26', 2025, 1009887, 1011556, 'Lexus', null),
('URZ100', 2025, 8569, 9259, 'Lexus', null),
('GWZ100', 2025, 3397, 3486, 'Lexus', null),
('AXZH11', 2025, 1017318, 1019290, 'Lexus', null),
('GB5', 2024, 3250682, 3255281, 'Honda', null),
('GB5', 2024, 7200574, 7200710, 'Honda', null),
('GB6', 2024, 3207331, 3208746, 'Honda', null),
('GB7', 2024, 3258440, 3266892, 'Honda', null),
('GB7', 2024, 7200319, 7200422, 'Honda', null),
('GB8', 2024, 3210551, 3213365, 'Honda', null),
('ZC7', 2024, 1100512, 1100549, 'Honda', null),
('FL1', 2024, 1200544, 1202114, 'Honda', null),
('FL1', 2024, 1300001, 1301413, 'Honda', null),
('RP6', 2024, 1115955, 1127686, 'Honda', null),
('RP6', 2024, 1127688, 1127713, 'Honda', null),
('RP6', 2024, 5100210, 5100385, 'Honda', null),
('RP7', 2024, 1107271, 1113263, 'Honda', null),
('RP7', 2024, 5100045, 5100102, 'Honda', null),
('RP8', 2024, 1058075, 1091902, 'Honda', null),
('FL4', 2024, 1101258, 1103596, 'Honda', null),
('FL4', 2024, 1200001, 1201523, 'Honda', null),
('FL5', 2024, 1101220, 1105759, 'Honda', null),
('FL5', 2024, 1200001, 1205087, 'Honda', null),
('RZ3', 2024, 1003899, 1005690, 'Honda', null),
('RZ3', 2024, 1100001, 1100609, 'Honda', null),
('RZ5', 2024, 1001176, 1001488, 'Honda', null),
('RZ5', 2024, 1100001, 1100241, 'Honda', null),
('RZ4', 2024, 1016861, 1028232, 'Honda', null),
('RZ4', 2024, 1100001, 1116071, 'Honda', null),
('RZ6', 2024, 1007103, 1012969, 'Honda', null),
('RZ6', 2024, 1100001, 1105381, 'Honda', null),
('GT1', 2024, 1000001, 1012976, 'Honda', null),
('GT2', 2024, 1000001, 1005354, 'Honda', null),
('GT2', 2024, 5000001, 5000237, 'Honda', null),
('GT3', 2024, 1000001, 1001747, 'Honda', null),
('GT4', 2024, 1000001, 1000744, 'Honda', null),
('GT5', 2024, 1000001, 1019599, 'Honda', null),
('GT6', 2024, 1000001, 1011152, 'Honda', null),
('GT7', 2024, 1000001, 1003002, 'Honda', null),
('GT8', 2024, 1000001, 1002843, 'Honda', null),
('GR3', 2024, 1346779, 1377415, 'Honda', null),
('GR3', 2024, 7200006, 7200006, 'Honda', null),
('GR3', 2024, 8200059, 8200128, 'Honda', null),
('GR4', 2024, 1207535, 1212785, 'Honda', null),
('GR4', 2024, 8200020, 8200036, 'Honda', null),
('GR6', 2024, 1204386, 1206848, 'Honda', null),
('GR8', 2024, 1201424, 1202118, 'Honda', null),
('GS4', 2024, 1015062, 1030105, 'Honda', null),
('GS4', 2024, 8000034, 8000069, 'Honda', null),
('GS5', 2024, 1001146, 1001808, 'Honda', null),
('GS6', 2024, 1002873, 1005668, 'Honda', null),
('GS6', 2024, 8000007, 8000014, 'Honda', null),
('GS7', 2024, 1000244, 1000453, 'Honda', null),
('RV3', 2024, 1016279, 1017561, 'Honda', null),
('RV4', 2024, 1002988, 1003313, 'Honda', null),
('RV4', 2024, 1100001, 1100003, 'Honda', null),
('RV4', 2024, 1100004, 1101817, 'Honda', null),
('RV5', 2024, 1116914, 1116925, 'Honda', null),
('RV5', 2024, 1116927, 1116928, 'Honda', null),
('RV5', 2024, 1116930, 1116934, 'Honda', null),
('RV5', 2024, 1116936, 1116958, 'Honda', null),
('RV5', 2024, 1116960, 1135798, 'Honda', null),
('RV5', 2024, 1200001, 1200002, 'Honda', null),
('RV5', 2024, 1200003, 1242242, 'Honda', null),
('RV6', 2024, 1027407, 1031672, 'Honda', null),
('RV6', 2024, 1100001, 1100004, 'Honda', null),
('RV6', 2024, 1100005, 1107172, 'Honda', null),
('JF5', 2024, 1037297, 1099999, 'Honda', null),
('JF5', 2024, 1100000, 1156676, 'Honda', null),
('JF5', 2024, 1156678, 1160428, 'Honda', null),
('JF5', 2024, 1160430, 1160430, 'Honda', null),
('JF5', 2024, 1160435, 1160435, 'Honda', null),
('JF5', 2024, 2019234, 2019234, 'Honda', null),
('JF5', 2024, 2019304, 2060604, 'Honda', null),
('JF5', 2024, 2060606, 2061572, 'Honda', null),
('JF5', 2024, 5000001, 5005732, 'Honda', null),
('JF5', 2024, 6000001, 6004864, 'Honda', null),
('JF5', 2024, 8000852, 8000852, 'Honda', null),
('JF5', 2024, 8000879, 8003574, 'Honda', null),
('JF6', 2024, 1007529, 1027887, 'Honda', null),
('JF6', 2024, 2003549, 2011071, 'Honda', null),
('JF6', 2024, 5000001, 5001139, 'Honda', null),
('JF6', 2024, 6000001, 6001080, 'Honda', null),
('JF6', 2024, 8000307, 8001037, 'Honda', null),
('JG3', 2024, 1114308, 1114312, 'Honda', null),
('JG3', 2024, 1114316, 1122038, 'Honda', null),
('JG3', 2024, 2111166, 2117384, 'Honda', null),
('JG4', 2024, 1102596, 1103984, 'Honda', null),
('JG4', 2024, 2100647, 2101083, 'Honda', null),
('JH3', 2024, 1238306, 1258439, 'Honda', null),
('JH3', 2024, 2108284, 2111506, 'Honda', null),
('JH3', 2024, 8100140, 8100230, 'Honda', null),
('JH4', 2024, 1108486, 1113471, 'Honda', null),
('JH4', 2024, 2101748, 2102515, 'Honda', null),
('JH4', 2024, 8100033, 8100050, 'Honda', null),
('JJ1', 2024, 5034167, 5034167, 'Honda', null),
('JJ1', 2024, 5034174, 5034174, 'Honda', null),
('JJ1', 2024, 5034176, 5034176, 'Honda', null),
('JJ1', 2024, 5034181, 5034188, 'Honda', null),
('JJ1', 2024, 5034191, 5036871, 'Honda', null),
('JJ1', 2024, 5100001, 5112006, 'Honda', null),
('JJ1', 2024, 6010460, 6010460, 'Honda', null),
('JJ1', 2024, 6010465, 6011191, 'Honda', null),
('JJ1', 2024, 6100001, 6103428, 'Honda', null),
('JJ2', 2024, 5012514, 5012514, 'Honda', null),
('JJ2', 2024, 5012520, 5012523, 'Honda', null),
('JJ2', 2024, 5012525, 5012525, 'Honda', null),
('JJ2', 2024, 5012545, 5014045, 'Honda', null),
('JJ2', 2024, 5100001, 5104034, 'Honda', null),
('JJ2', 2024, 6004930, 6005404, 'Honda', null),
('JJ2', 2024, 6100001, 6100002, 'Honda', null),
('JJ2', 2024, 6100003, 6101679, 'Honda', null),
('JJ2', 2024, 6101681, 6101681, 'Honda', null),
('JJ3', 2024, 1000001, 1000013, 'Honda', null),
('JJ3', 2024, 1000014, 1003494, 'Honda', null),
('MC51', 2024, 1504571, 1504850, 'Honda', null),
('SC54', 2024, 2702371, 2703413, 'Honda', null),
('SC54', 2024, 2800001, 2800003, 'Honda', null),
('SC80', 2024, 1400351, 1400498, 'Honda', null),
('SC83', 2024, 1200271, 1200631, 'Honda', null),
('RH09', 2024, 1101260, 1101558, 'Honda', null),
('RH10', 2024, 1101257, 1101481, 'Honda', null),
('SC82', 2024, 1200005, 1200660, 'Honda', null),
('SC84', 2024, 1200100, 1200124, 'Honda', null),
('RH14', 2024, 1001136, 1001297, 'Honda', null),
('PC60', 2024, 1300926, 1301045, 'Honda', null),
('PC60', 2024, 1400001, 1400043, 'Honda', null),
('SC79', 2024, 1500614, 1500826, 'Honda', null),
('SC79', 2024, 1600001, 1600002, 'Honda', null),
('PC68', 2024, 1001327, 1001447, 'Honda', null),
('PC68', 2024, 1100001, 1100001, 'Honda', null),
('NC59', 2024, 1107378, 1110657, 'Honda', null),
('NC59', 2024, 1200001, 1200004, 'Honda', null),
('RD16', 2024, 1100001, 1100002, 'Honda', null),
('NC65', 2024, 1000020, 1001776, 'Honda', null),
('PC40', 2024, 1800171, 1801495, 'Honda', null),
('SD15', 2024, 1000001, 1000551, 'Honda', null),
('RH17', 2024, 1000001, 1000427, 'Honda', null),
('RH17', 2024, 1100001, 1101708, 'Honda', null),
('NC64', 2024, 1000001, 1001171, 'Honda', null),
('NC64', 2024, 1100001, 1100002, 'Honda', null),
('NC66', 2024, 1000001, 1002369, 'Honda', null),
('RH21', 2024, 1000001, 1000403, 'Honda', null),
('RH24', 2024, 1000001, 1000104, 'Honda', null),
('SC86', 2024, 1000001, 1000584, 'Honda', null),
('SC87', 2024, 1000001, 1000008, 'Honda', null),
('SC90', 2024, 1000001, 1000055, 'Honda', null),
('SC91', 2024, 1000001, 1000205, 'Honda', null),
('RH23', 2024, 1000001, 1000013, 'Honda', null),
('FL1', 2025, 1301414, 1302209, 'Honda', null),
('FL1', 2025, 1400001, 1403925, 'Honda', null),
('RP6', 2025, 1127687, 1127687, 'Honda', null),
('RP6', 2025, 1127714, 1131075, 'Honda', null),
('RP6', 2025, 5100386, 5100426, 'Honda', null),
('RP6', 2025, 1200001, 1207526, 'Honda', null),
('RP6', 2025, 1300001, 1300006, 'Honda', null),
('RP7', 2025, 1113264, 1115224, 'Honda', null),
('RP7', 2025, 5100103, 5100116, 'Honda', null),
('RP7', 2025, 1200001, 1203845, 'Honda', null),
('RP7', 2025, 1300001, 1300004, 'Honda', null),
('RP8', 2025, 1091903, 1099999, 'Honda', null),
('RP8', 2025, 1100001, 1100024, 'Honda', null),
('RP8', 2025, 1200001, 1203615, 'Honda', null),
('RP8', 2025, 1300001, 1333037, 'Honda', null),
('FL4', 2025, 1201524, 1202459, 'Honda', null),
('FL4', 2025, 1300001, 1302552, 'Honda', null),
('FL5', 2025, 1205088, 1217051, 'Honda', null),
('RZ3', 2025, 1100610, 1101306, 'Honda', null),
('RZ5', 2025, 1100242, 1100498, 'Honda', null),
('RZ4', 2025, 1116072, 1128762, 'Honda', null),
('RZ6', 2025, 1105382, 1110518, 'Honda', null),
('GT1', 2025, 1012977, 1022268, 'Honda', null),
('GT1', 2025, 1100001, 1108679, 'Honda', null),
('GT2', 2025, 1005355, 1007179, 'Honda', null),
('GT2', 2025, 5000238, 5000342, 'Honda', null),
('GT2', 2025, 1100001, 1102120, 'Honda', null),
('GT2', 2025, 5100001, 5100126, 'Honda', null),
('GT3', 2025, 1001748, 1002703, 'Honda', null),
('GT3', 2025, 1100001, 1101200, 'Honda', null),
('GT4', 2025, 1000745, 1001114, 'Honda', null),
('GT4', 2025, 1100001, 1100399, 'Honda', null),
('GT5', 2025, 1019600, 1041111, 'Honda', null),
('GT5', 2025, 1100001, 1118644, 'Honda', null),
('GT6', 2025, 1011153, 1018266, 'Honda', null),
('GT6', 2025, 1100001, 1107458, 'Honda', null),
('GT7', 2025, 1003003, 1006515, 'Honda', null),
('GT7', 2025, 1100001, 1102832, 'Honda', null),
('GT8', 2025, 1002844, 1004691, 'Honda', null),
('GT8', 2025, 1100001, 1101711, 'Honda', null),
('BF1', 2025, 1000001, 1002131, 'Honda', null),
('GR3', 2025, 1377416, 1399999, 'Honda', null),
('GR3', 2025, 1400000, 1403269, 'Honda', null),
('GR3', 2025, 8200129, 8200208, 'Honda', null),
('GR4', 2025, 1212786, 1217548, 'Honda', null),
('GR4', 2025, 8200037, 8200051, 'Honda', null),
('GR6', 2025, 1206849, 1208779, 'Honda', null),
('GR8', 2025, 1202119, 1202675, 'Honda', null),
('GS4', 2025, 1030106, 1040792, 'Honda', null),
('GS4', 2025, 8000070, 8000107, 'Honda', null),
('GS5', 2025, 1001809, 1002248, 'Honda', null),
('GS6', 2025, 1005669, 1007772, 'Honda', null),
('GS6', 2025, 8000015, 8000021, 'Honda', null),
('GS7', 2025, 1000454, 1000570, 'Honda', null),
('RV4', 2025, 1101818, 1104040, 'Honda', null),
('RV4', 2025, 1200001, 1200737, 'Honda', null),
('RV5', 2025, 1242243, 1278408, 'Honda', null),
('RV5', 2025, 1300001, 1315888, 'Honda', null),
('RV6', 2025, 1107173, 1112999, 'Honda', null),
('RV6', 2025, 1200001, 1203051, 'Honda', null),
('JF5', 2025, 1156677, 1156677, 'Honda', null),
('JF5', 2025, 1160429, 1160429, 'Honda', null),
('JF5', 2025, 1160431, 1160434, 'Honda', null),
('JF5', 2025, 1160436, 1188293, 'Honda', null),
('JF5', 2025, 1300001, 1371519, 'Honda', null),
('JF5', 2025, 1371537, 1371537, 'Honda', null),
('JF5', 2025, 1371557, 1371557, 'Honda', null),
('JF5', 2025, 2060605, 2060605, 'Honda', null),
('JF5', 2025, 2061573, 2070618, 'Honda', null),
('JF5', 2025, 2100001, 2128830, 'Honda', null),
('JF5', 2025, 2128832, 2128889, 'Honda', null),
('JF5', 2025, 5005733, 5020465, 'Honda', null),
('JF5', 2025, 6004865, 6016408, 'Honda', null),
('JF5', 2025, 8003575, 8004341, 'Honda', null),
('JF5', 2025, 8100001, 8101598, 'Honda', null),
('JF6', 2025, 1027888, 1032053, 'Honda', null),
('JF6', 2025, 1100001, 1112850, 'Honda', null),
('JF6', 2025, 2011072, 2012413, 'Honda', null),
('JF6', 2025, 2100001, 2104765, 'Honda', null),
('JF6', 2025, 5001140, 5004176, 'Honda', null),
('JF6', 2025, 6001081, 6003486, 'Honda', null),
('JF6', 2025, 6003488, 6003501, 'Honda', null),
('JF6', 2025, 8001038, 8001313, 'Honda', null),
('JF6', 2025, 8100001, 8100482, 'Honda', null),
('JG3', 2025, 1122039, 1127354, 'Honda', null),
('JG3', 2025, 2117385, 2122704, 'Honda', null),
('JG3', 2025, 1200001, 1201236, 'Honda', null),
('JG3', 2025, 2200001, 2200817, 'Honda', null),
('JG4', 2025, 1103985, 1104951, 'Honda', null),
('JG4', 2025, 2101084, 2101340, 'Honda', null),
('JG4', 2025, 1200001, 1200315, 'Honda', null),
('JG4', 2025, 2200001, 2200106, 'Honda', null),
('JG5', 2025, 1000001, 1006900, 'Honda', null),
('JG6', 2025, 1000001, 1000014, 'Honda', null),
('JH3', 2025, 1258440, 1272760, 'Honda', null),
('JH3', 2025, 2111507, 2113702, 'Honda', null),
('JH3', 2025, 8100231, 8100293, 'Honda', null),
('JH3', 2025, 1300001, 1304065, 'Honda', null),
('JH3', 2025, 2200001, 2201340, 'Honda', null),
('JH3', 2025, 8200001, 8200024, 'Honda', null),
('JH4', 2025, 1113472, 1117011, 'Honda', null),
('JH4', 2025, 2102516, 2103105, 'Honda', null),
('JH4', 2025, 8100051, 8100066, 'Honda', null),
('JH4', 2025, 1200001, 1201102, 'Honda', null),
('JH4', 2025, 2200001, 2200223, 'Honda', null),
('JH4', 2025, 8200001, 8200005, 'Honda', null),
('JJ1', 2025, 5112007, 5126411, 'Honda', null),
('JJ1', 2025, 5126426, 5126426, 'Honda', null),
('JJ1', 2025, 5126428, 5126428, 'Honda', null),
('JJ1', 2025, 5200001, 5200006, 'Honda', null),
('JJ1', 2025, 6103429, 6107806, 'Honda', null),
('JJ1', 2025, 6200001, 6200003, 'Honda', null),
('JJ2', 2025, 5104035, 5108910, 'Honda', null),
('JJ2', 2025, 5108912, 5108923, 'Honda', null),
('JJ2', 2025, 5108926, 5108928, 'Honda', null),
('JJ2', 2025, 5200001, 5200004, 'Honda', null),
('JJ2', 2025, 6101680, 6101680, 'Honda', null),
('JJ2', 2025, 6101682, 6103776, 'Honda', null),
('JJ2', 2025, 6103778, 6103868, 'Honda', null),
('JJ2', 2025, 6200001, 6200005, 'Honda', null),
('JJ3', 2025, 1003495, 1013013, 'Honda', null),
('MC51', 2025, 1600001, 1601480, 'Honda', null),
('SC54', 2025, 2800004, 2803389, 'Honda', null),
('SC82', 2025, 1200661, 1201005, 'Honda', null),
('RH14', 2025, 1001298, 1001392, 'Honda', null),
('PC60', 2025, 1400044, 1400243, 'Honda', null),
('SC79', 2025, 1600003, 1600900, 'Honda', null),
('SC79', 2025, 1700001, 1700020, 'Honda', null),
('PC68', 2025, 1100002, 1100081, 'Honda', null),
('RD16', 2025, 1100003, 1100211, 'Honda', null),
('RD16', 2025, 1200001, 1200001, 'Honda', null),
('NC59', 2025, 1110658, 1111017, 'Honda', null),
('NC59', 2025, 1200005, 1203488, 'Honda', null),
('PC40', 2025, 1801496, 1802660, 'Honda', null),
('NC65', 2025, 1001777, 1002816, 'Honda', null),
('NC65', 2025, 1100001, 1100016, 'Honda', null),
('SD15', 2025, 1000552, 1000633, 'Honda', null),
('RH17', 2025, 1000428, 1000507, 'Honda', null),
('RH17', 2025, 1101709, 1103608, 'Honda', null),
('NC66', 2025, 1002370, 1002609, 'Honda', null),
('NC66', 2025, 1100001, 1100004, 'Honda', null),
('NC64', 2025, 1001172, 1002971, 'Honda', null),
('NC64', 2025, 1100003, 1100803, 'Honda', null),
('RH21', 2025, 1000404, 1001893, 'Honda', null),
('SC91', 2025, 1000206, 1000415, 'Honda', null),
('RH24', 2025, 1000105, 1000544, 'Honda', null),
('RH24', 2025, 1100001, 1100002, 'Honda', null),
('SC90', 2025, 1000056, 1000230, 'Honda', null),
('SC87', 2025, 1000009, 1001617, 'Honda', null),
('SC86', 2025, 1000585, 1000750, 'Honda', null),
('RH23', 2025, 1000014, 1001404, 'Honda', null),
('SC93', 2025, 1000001, 1000219, 'Honda', null),
('SC94', 2025, 1000001, 1001426, 'Honda', null),
('BPEK3R', 2024, 100180, 100272, 'Mazda', null),
('BPEK3R', 2024, 150002, 150095, 'Mazda', null),
('BPFJ3R', 2024, 104511, 104511, 'Mazda', null),
('BPFJ3R', 2024, 104535, 107777, 'Mazda', null),
('BPFJ3R', 2024, 150001, 153108, 'Mazda', null),
('BPFJ3R', 2024, 153111, 153142, 'Mazda', null),
('BP5R', 2024, 102341, 104534, 'Mazda', null),
('BP5R', 2024, 150001, 151960, 'Mazda', null),
('BP5R', 2024, 151963, 151971, 'Mazda', null),
('BP8R', 2024, 101778, 102606, 'Mazda', null),
('BP8R', 2024, 150001, 150942, 'Mazda', null),
('DJLAS', 2024, 301708, 302319, 'Mazda', null),
('DJLAS', 2024, 350158, 350158, 'Mazda', null),
('DJLAS', 2024, 350171, 351774, 'Mazda', null),
('DJLAS', 2024, 351776, 351783, 'Mazda', null),
('DJLFJ', 2024, 102352, 102352, 'Mazda', null),
('DJLFJ', 2024, 102976, 102976, 'Mazda', null),
('DJLFJ', 2024, 103843, 104668, 'Mazda', null),
('DJLFJ', 2024, 104670, 104670, 'Mazda', null),
('DJLFJ', 2024, 104674, 104678, 'Mazda', null),
('DJLFS', 2024, 810117, 810117, 'Mazda', 'shared common sequence'),
('DJLFS', 2024, 810207, 814259, 'Mazda', null),
('DJLFS', 2024, 850787, 850787, 'Mazda', null),
('DJLFS', 2024, 850893, 850893, 'Mazda', null),
('DJLFS', 2024, 850920, 863002, 'Mazda', null),
('DJLFS', 2024, 863004, 863156, 'Mazda', null),
('DJLFS', 2024, 863158, 863167, 'Mazda', null),
('DJ5AS', 2024, 700472, 700571, 'Mazda', null),
('DJ5AS', 2024, 750066, 750066, 'Mazda', null),
('DJ5AS', 2024, 750071, 750634, 'Mazda', null),
('DJ5FS', 2024, 702066, 702526, 'Mazda', null),
('DJ5FS', 2024, 750302, 750302, 'Mazda', null),
('DJ5FS', 2024, 750310, 753042, 'Mazda', null),
('DKLAY', 2024, 850201, 851432, 'Mazda', null),
('DKLFY', 2024, 840201, 845649, 'Mazda', null),
('DKLFY', 2024, 845651, 845656, 'Mazda', null),
('DKLFY', 2024, 845658, 845710, 'Mazda', null),
('DKLFY', 2024, 845712, 845823, 'Mazda', null),
('DKLFY', 2024, 845825, 845976, 'Mazda', null),
('DKLFY', 2024, 845978, 845986, 'Mazda', null),
('DKLFY', 2024, 845988, 846121, 'Mazda', null),
('DKLFY', 2024, 846123, 846132, 'Mazda', null),
('DKLFY', 2024, 846134, 846177, 'Mazda', null),
('DK8AY', 2024, 870201, 870571, 'Mazda', null),
('DK8AY', 2024, 870573, 870588, 'Mazda', null),
('DK8AY', 2024, 870590, 870600, 'Mazda', null),
('DK8AY', 2024, 870602, 870637, 'Mazda', null),
('DK8FY', 2024, 860201, 861023, 'Mazda', null),
('DK8FY', 2024, 861025, 861038, 'Mazda', null),
('DMEJ3R', 2024, 103895, 103895, 'Mazda', null),
('DMEJ3R', 2024, 103904, 108374, 'Mazda', null),
('DMEJ3R', 2024, 150002, 154447, 'Mazda', null),
('DMEJ3R', 2024, 154449, 155646, 'Mazda', null),
('DMEJ3R', 2024, 155648, 155742, 'Mazda', null),
('DMEJ3R', 2024, 155744, 155759, 'Mazda', null),
('DMEJ3R', 2024, 155761, 155766, 'Mazda', null),
('DMEJ3R', 2024, 155768, 155832, 'Mazda', null),
('DMEJ3R', 2024, 155834, 155834, 'Mazda', null),
('DM8R', 2024, 102182, 103446, 'Mazda', null),
('DM8R', 2024, 150002, 152388, 'Mazda', null),
('DM8R', 2024, 152390, 152398, 'Mazda', null),
('DREJ3P', 2024, 151458, 151730, 'Mazda', null),
('DREJ3R', 2024, 100010, 100424, 'Mazda', null),
('DRH3P', 2024, 150031, 150037, 'Mazda', null),
('DRH3R', 2024, 100004, 100010, 'Mazda', null),
('DR8V3P', 2024, 101038, 101211, 'Mazda', null),
('DR8V3R', 2024, 100005, 100100, 'Mazda', null),
('GJEFP', 2024, 600263, 600369, 'Mazda', null),
('GJEFW', 2024, 600139, 600186, 'Mazda', null),
('GJ2AP', 2024, 600368, 600368, 'Mazda', null),
('GJ2AP', 2024, 600371, 600532, 'Mazda', null),
('GJ2AW', 2024, 600332, 600461, 'Mazda', null),
('GJ2FP', 2024, 600599, 600909, 'Mazda', null),
('GJ2FW', 2024, 600393, 600586, 'Mazda', null),
('GJ5FP', 2024, 600391, 600610, 'Mazda', null),
('GJ5FW', 2024, 600312, 600446, 'Mazda', null),
('KFEP', 2024, 602489, 602489, 'Mazda', null),
('KFEP', 2024, 602495, 610196, 'Mazda', null),
('KF2P', 2024, 605076, 605076, 'Mazda', null),
('KF2P', 2024, 605562, 605562, 'Mazda', null),
('KF2P', 2024, 605568, 605568, 'Mazda', null),
('KF2P', 2024, 605589, 614986, 'Mazda', null),
('KF2P', 2024, 614989, 614990, 'Mazda', null),
('KF5P', 2024, 600739, 603030, 'Mazda', null),
('KG2P', 2024, 462176, 462176, 'Mazda', null),
('KG2P', 2024, 462285, 462285, 'Mazda', null),
('KG2P', 2024, 462298, 462298, 'Mazda', null),
('KG2P', 2024, 462300, 462300, 'Mazda', null),
('KG2P', 2024, 462302, 462303, 'Mazda', null),
('KG2P', 2024, 462308, 462309, 'Mazda', null),
('KG5P', 2024, 356552, 356552, 'Mazda', null),
('KG5P', 2024, 356554, 356554, 'Mazda', null),
('KG5P', 2024, 356559, 356559, 'Mazda', null),
('KH3P', 2024, 110207, 110207, 'Mazda', null),
('KH3P', 2024, 110355, 110355, 'Mazda', null),
('KH3P', 2024, 110372, 110372, 'Mazda', null),
('KH3P', 2024, 110382, 110382, 'Mazda', null),
('KH3P', 2024, 110447, 110447, 'Mazda', null),
('KH3P', 2024, 110481, 110481, 'Mazda', null),
('KH3P', 2024, 110522, 110522, 'Mazda', null),
('KH3P', 2024, 110653, 110653, 'Mazda', null),
('KH3P', 2024, 110669, 110669, 'Mazda', null),
('KH3P', 2024, 110685, 110685, 'Mazda', null),
('KH3P', 2024, 110713, 110713, 'Mazda', null),
('KH3P', 2024, 110749, 110749, 'Mazda', null),
('KH3P', 2024, 110851, 110851, 'Mazda', null),
('KH3P', 2024, 110886, 110886, 'Mazda', null),
('KH3P', 2024, 110898, 110898, 'Mazda', null),
('KH3P', 2024, 110937, 110937, 'Mazda', null),
('KH3P', 2024, 110945, 110945, 'Mazda', null),
('KH3P', 2024, 111307, 111307, 'Mazda', null),
('KH3P', 2024, 111460, 111460, 'Mazda', null),
('KH3P', 2024, 111472, 111472, 'Mazda', null),
('KH3P', 2024, 111495, 111496, 'Mazda', null),
('KH3P', 2024, 111504, 111504, 'Mazda', null),
('KH3P', 2024, 111508, 111508, 'Mazda', null),
('KH3P', 2024, 111514, 111514, 'Mazda', null),
('KH3P', 2024, 111516, 111516, 'Mazda', null),
('KH3P', 2024, 111578, 111578, 'Mazda', null),
('KH3P', 2024, 111592, 111592, 'Mazda', null),
('KH3P', 2024, 111597, 111598, 'Mazda', null),
('KH3P', 2024, 111614, 111614, 'Mazda', null),
('KH3P', 2024, 111627, 111627, 'Mazda', null),
('KH3P', 2024, 111629, 111629, 'Mazda', null),
('KH3P', 2024, 111644, 111644, 'Mazda', null),
('KH3P', 2024, 111681, 111681, 'Mazda', null),
('KH3P', 2024, 111683, 111683, 'Mazda', null),
('KH3P', 2024, 111687, 111687, 'Mazda', null),
('KH3P', 2024, 111694, 111694, 'Mazda', null),
('KH3P', 2024, 111700, 111701, 'Mazda', null),
('KH3P', 2024, 111705, 111707, 'Mazda', null),
('KH3P', 2024, 111709, 113915, 'Mazda', null),
('KH3R3P', 2024, 112041, 112041, 'Mazda', null),
('KH3R3P', 2024, 112047, 112047, 'Mazda', null),
('KH3R3P', 2024, 112066, 112066, 'Mazda', null),
('KH3R3P', 2024, 112154, 112154, 'Mazda', null),
('KH3R3P', 2024, 112216, 112216, 'Mazda', null),
('KH3R3P', 2024, 112218, 112218, 'Mazda', null),
('KH3R3P', 2024, 112220, 112220, 'Mazda', null),
('KH3R3P', 2024, 112493, 112493, 'Mazda', null),
('KH3R3P', 2024, 112551, 112551, 'Mazda', null),
('KH3R3P', 2024, 112557, 112557, 'Mazda', null),
('KH3R3P', 2024, 112579, 112579, 'Mazda', null),
('KH3R3P', 2024, 112595, 112595, 'Mazda', null),
('KH3R3P', 2024, 112608, 112608, 'Mazda', null),
('KH3R3P', 2024, 112622, 112622, 'Mazda', null),
('KH3R3P', 2024, 112632, 112632, 'Mazda', null),
('KH3R3P', 2024, 112672, 112672, 'Mazda', null),
('KH3R3P', 2024, 112683, 112683, 'Mazda', null),
('KH3R3P', 2024, 112685, 114279, 'Mazda', null),
('KH5P', 2024, 105203, 105203, 'Mazda', null),
('KH5P', 2024, 105302, 105302, 'Mazda', null),
('KH5P', 2024, 105319, 107022, 'Mazda', null),
('KH5S3P', 2024, 101135, 101135, 'Mazda', null),
('KH5S3P', 2024, 101201, 101418, 'Mazda', null),
('KL3P', 2024, 100017, 104359, 'Mazda', null),
('KL3P', 2024, 104361, 104370, 'Mazda', null),
('KL3P', 2024, 104372, 104385, 'Mazda', null),
('KL3P', 2024, 104387, 104419, 'Mazda', null),
('KL3P', 2024, 104421, 104439, 'Mazda', null),
('KL3P', 2024, 104441, 104449, 'Mazda', null),
('KL3P', 2024, 104451, 104453, 'Mazda', null),
('KL3P', 2024, 104455, 104480, 'Mazda', null),
('KL3P', 2024, 104483, 104483, 'Mazda', null),
('KL3P', 2024, 104486, 104486, 'Mazda', null),
('KL3P', 2024, 104490, 104491, 'Mazda', null),
('KL3R3P', 2024, 100019, 103757, 'Mazda', null),
('KL3R3P', 2024, 103759, 103987, 'Mazda', null),
('KL3R3P', 2024, 103989, 104308, 'Mazda', null),
('KL3R3P', 2024, 104310, 104320, 'Mazda', null),
('KL3R3P', 2024, 104322, 104328, 'Mazda', null),
('KL5S3P', 2024, 100007, 100461, 'Mazda', null),
('NDERE', 2024, 100003, 100417, 'Mazda', null),
('NDERE', 2024, 100419, 102410, 'Mazda', null),
('NDERE', 2024, 150002, 150029, 'Mazda', null),
('NDERE', 2024, 150031, 150085, 'Mazda', null),
('ND5RE', 2024, 100006, 100232, 'Mazda', null),
('ND5RE', 2024, 100235, 101179, 'Mazda', null),
('ND5RE', 2024, 101182, 107251, 'Mazda', null),
('ND5RE', 2024, 150002, 150032, 'Mazda', null),
('ND5RE', 2024, 150034, 150044, 'Mazda', null),
('ND5RE', 2024, 150046, 150046, 'Mazda', null),
('ND5RE', 2024, 150048, 150059, 'Mazda', null),
('ND5RE', 2024, 150061, 150069, 'Mazda', null),
('ND5RE', 2024, 150071, 150071, 'Mazda', null),
('ND5RE', 2024, 150073, 150075, 'Mazda', null),
('ND5RE', 2024, 150077, 150080, 'Mazda', null),
('ND5RE', 2024, 150082, 150085, 'Mazda', null),
('ND5RE', 2024, 150087, 150095, 'Mazda', null),
('ND5RE', 2024, 150097, 150097, 'Mazda', null),
('ND5RE', 2024, 150099, 150110, 'Mazda', null),
('ND5RE', 2024, 150112, 150118, 'Mazda', null),
('ND5RE', 2024, 150120, 150120, 'Mazda', null),
('BPEK3R', 2025, 150096, 150236, 'Mazda', null),
('BPEK3R', 2025, 200001, 200038, 'Mazda', null),
('BPFJ3R', 2025, 153109, 153110, 'Mazda', null),
('BPFJ3R', 2025, 153143, 157190, 'Mazda', null),
('BPFJ3R', 2025, 200001, 200956, 'Mazda', null),
('BPFJ3R', 2025, 200958, 201027, 'Mazda', null),
('BP5R', 2025, 151961, 151962, 'Mazda', null),
('BP5R', 2025, 151972, 155442, 'Mazda', null),
('BP5R', 2025, 200001, 200430, 'Mazda', null),
('BP8R', 2025, 150943, 152183, 'Mazda', null),
('BP8R', 2025, 200001, 200555, 'Mazda', null),
('DJLAS', 2025, 302320, 303079, 'Mazda', null),
('DJLAS', 2025, 303081, 303085, 'Mazda', null),
('DJLAS', 2025, 351775, 351775, 'Mazda', null),
('DJLAS', 2025, 351784, 353556, 'Mazda', null),
('DJLFJ', 2025, 104669, 104669, 'Mazda', null),
('DJLFJ', 2025, 104671, 104673, 'Mazda', null),
('DJLFJ', 2025, 104679, 105663, 'Mazda', null),
('DJLFJ', 2025, 105665, 105681, 'Mazda', null),
('DJLFJ', 2025, 105685, 105735, 'Mazda', null),
('DJLFJ', 2025, 105738, 105757, 'Mazda', null),
('DJLFJ', 2025, 105759, 105759, 'Mazda', null),
('DJLFJ', 2025, 105761, 105761, 'Mazda', null),
('DJLFJ', 2025, 105764, 105765, 'Mazda', null),
('DJLFJ', 2025, 105767, 105774, 'Mazda', null),
('DJLFJ', 2025, 105778, 105780, 'Mazda', null),
('DJLFJ', 2025, 105783, 105794, 'Mazda', null),
('DJLFJ', 2025, 105796, 105806, 'Mazda', null),
('DJLFJ', 2025, 105808, 105823, 'Mazda', null),
('DJLFJ', 2025, 105825, 105832, 'Mazda', null),
('DJLFJ', 2025, 105834, 105837, 'Mazda', null),
('DJLFJ', 2025, 105883, 105883, 'Mazda', null),
('DJLFJ', 2025, 105916, 105916, 'Mazda', null),
('DJLFJ', 2025, 105930, 105930, 'Mazda', null),
('DJLFS', 2025, 814260, 819448, 'Mazda', 'shared common sequence'),
('DJLFS', 2025, 863003, 863003, 'Mazda', null),
('DJLFS', 2025, 863157, 863157, 'Mazda', null),
('DJLFS', 2025, 863168, 877184, 'Mazda', null),
('DJLFS', 2025, 877186, 877270, 'Mazda', null),
('DJLFS', 2025, 877272, 877276, 'Mazda', null),
('DKLAY', 2025, 851433, 852491, 'Mazda', null),
('DKLAY', 2025, 852493, 852511, 'Mazda', null),
('DKLAY', 2025, 852513, 852513, 'Mazda', null),
('DKLAY', 2025, 852515, 852516, 'Mazda', null),
('DKLAY', 2025, 852518, 852529, 'Mazda', null),
('DKLAY', 2025, 852531, 852535, 'Mazda', null),
('DKLAY', 2025, 852537, 852560, 'Mazda', null),
('DKLAY', 2025, 852563, 852564, 'Mazda', null),
('DKLAY', 2025, 852566, 852566, 'Mazda', null),
('DKLAY', 2025, 852568, 852569, 'Mazda', null),
('DKLAY', 2025, 852571, 852577, 'Mazda', null),
('DKLFY', 2025, 845650, 845650, 'Mazda', null),
('DKLFY', 2025, 845657, 845657, 'Mazda', null),
('DKLFY', 2025, 845711, 845711, 'Mazda', null),
('DKLFY', 2025, 845824, 845824, 'Mazda', null),
('DKLFY', 2025, 845977, 845977, 'Mazda', null),
('DKLFY', 2025, 845987, 845987, 'Mazda', null),
('DKLFY', 2025, 846122, 846122, 'Mazda', null),
('DKLFY', 2025, 846133, 846133, 'Mazda', null),
('DKLFY', 2025, 846178, 850210, 'Mazda', null),
('DKLFY', 2025, 850212, 850511, 'Mazda', null),
('DKLFY', 2025, 850513, 851189, 'Mazda', null),
('DKLFY', 2025, 851191, 851213, 'Mazda', null),
('DKLFY', 2025, 851215, 851215, 'Mazda', null),
('DKLFY', 2025, 851217, 851218, 'Mazda', null),
('DKLFY', 2025, 851220, 851236, 'Mazda', null),
('DKLFY', 2025, 851238, 851243, 'Mazda', null),
('DKLFY', 2025, 851245, 851249, 'Mazda', null),
('DKLFY', 2025, 851251, 851255, 'Mazda', null),
('DKLFY', 2025, 851257, 851260, 'Mazda', null),
('DKLFY', 2025, 851262, 851265, 'Mazda', null),
('DKLFY', 2025, 851267, 851270, 'Mazda', null),
('DKLFY', 2025, 851272, 851273, 'Mazda', null),
('DKLFY', 2025, 851275, 851285, 'Mazda', null),
('DKLFY', 2025, 851287, 851289, 'Mazda', null),
('DKLFY', 2025, 851291, 851304, 'Mazda', null),
('DKLFY', 2025, 851307, 851320, 'Mazda', null),
('DKLFY', 2025, 851322, 851330, 'Mazda', null),
('DKLFY', 2025, 851333, 851350, 'Mazda', null),
('DKLFY', 2025, 851352, 851367, 'Mazda', null),
('DKLFY', 2025, 851369, 851384, 'Mazda', null),
('DKLFY', 2025, 851386, 851405, 'Mazda', null),
('DKLFY', 2025, 851407, 851424, 'Mazda', null),
('DKLFY', 2025, 851426, 851428, 'Mazda', null),
('DKLFY', 2025, 851430, 851435, 'Mazda', null),
('DKLFY', 2025, 851437, 851437, 'Mazda', null),
('DKLFY', 2025, 851439, 851440, 'Mazda', null),
('DKLFY', 2025, 851442, 851442, 'Mazda', null),
('DKLFY', 2025, 851444, 851452, 'Mazda', null),
('DKLFY', 2025, 851454, 851455, 'Mazda', null),
('DKLFY', 2025, 851457, 851462, 'Mazda', null),
('DKLFY', 2025, 851464, 851491, 'Mazda', null),
('DKLFY', 2025, 851493, 851496, 'Mazda', null),
('DKLFY', 2025, 851498, 851505, 'Mazda', null),
('DKLFY', 2025, 851507, 851508, 'Mazda', null),
('DKLFY', 2025, 851510, 851511, 'Mazda', null),
('DKLFY', 2025, 851513, 851513, 'Mazda', null),
('DKLFY', 2025, 851515, 851515, 'Mazda', null),
('DKLFY', 2025, 851518, 851531, 'Mazda', null),
('DKLFY', 2025, 851534, 851535, 'Mazda', null),
('DKLFY', 2025, 851537, 851539, 'Mazda', null),
('DKLFY', 2025, 851541, 851546, 'Mazda', null),
('DKLFY', 2025, 851548, 851551, 'Mazda', null),
('DKLFY', 2025, 851553, 851561, 'Mazda', null),
('DKLFY', 2025, 851563, 851563, 'Mazda', null),
('DKLFY', 2025, 851565, 851568, 'Mazda', null),
('DKLFY', 2025, 851570, 851574, 'Mazda', null),
('DKLFY', 2025, 851577, 851577, 'Mazda', null),
('DKLFY', 2025, 851579, 851581, 'Mazda', null),
('DKLFY', 2025, 851583, 851583, 'Mazda', null),
('DKLFY', 2025, 851586, 851593, 'Mazda', null),
('DKLFY', 2025, 851595, 851603, 'Mazda', null),
('DKLFY', 2025, 851605, 851611, 'Mazda', null),
('DKLFY', 2025, 851613, 851613, 'Mazda', null),
('DKLFY', 2025, 851616, 851617, 'Mazda', null),
('DKLFY', 2025, 851619, 851628, 'Mazda', null),
('DK8AY', 2025, 870572, 870572, 'Mazda', null),
('DK8AY', 2025, 870589, 870589, 'Mazda', null),
('DK8AY', 2025, 870601, 870601, 'Mazda', null),
('DK8AY', 2025, 870638, 871004, 'Mazda', null),
('DK8AY', 2025, 871006, 871009, 'Mazda', null),
('DK8AY', 2025, 871011, 871011, 'Mazda', null),
('DK8AY', 2025, 871014, 871015, 'Mazda', null),
('DK8AY', 2025, 871017, 871026, 'Mazda', null),
('DK8AY', 2025, 871028, 871029, 'Mazda', null),
('DK8AY', 2025, 871031, 871035, 'Mazda', null),
('DK8AY', 2025, 871037, 871038, 'Mazda', null),
('DK8AY', 2025, 871040, 871041, 'Mazda', null),
('DK8FY', 2025, 861024, 861024, 'Mazda', null),
('DK8FY', 2025, 861039, 861793, 'Mazda', null),
('DK8FY', 2025, 861795, 861799, 'Mazda', null),
('DK8FY', 2025, 861801, 861807, 'Mazda', null),
('DK8FY', 2025, 861809, 861810, 'Mazda', null),
('DK8FY', 2025, 861812, 861834, 'Mazda', null),
('DK8FY', 2025, 861836, 861841, 'Mazda', null),
('DK8FY', 2025, 861843, 861851, 'Mazda', null),
('DK8FY', 2025, 861853, 861855, 'Mazda', null),
('DK8FY', 2025, 861857, 861866, 'Mazda', null),
('DK8FY', 2025, 861868, 861870, 'Mazda', null),
('DMEJ3R', 2025, 154448, 154448, 'Mazda', null),
('DMEJ3R', 2025, 155647, 155647, 'Mazda', null),
('DMEJ3R', 2025, 155743, 155743, 'Mazda', null),
('DMEJ3R', 2025, 155760, 155760, 'Mazda', null),
('DMEJ3R', 2025, 155767, 155767, 'Mazda', null),
('DMEJ3R', 2025, 155833, 155833, 'Mazda', null),
('DMEJ3R', 2025, 155835, 162252, 'Mazda', null),
('DMEJ3R', 2025, 200001, 202771, 'Mazda', null),
('DMEJ3R', 2025, 202773, 202783, 'Mazda', null),
('DM8R', 2025, 152389, 152389, 'Mazda', null),
('DM8R', 2025, 152399, 154662, 'Mazda', null),
('DM8R', 2025, 200002, 200990, 'Mazda', null),
('DM8R', 2025, 200992, 201001, 'Mazda', null),
('DM8R', 2025, 201003, 201060, 'Mazda', null),
('DREJ3R', 2025, 100425, 101026, 'Mazda', null),
('DREJ3R', 2025, 101028, 101029, 'Mazda', null),
('DREJ3R', 2025, 101031, 101031, 'Mazda', null),
('DREJ3R', 2025, 101033, 101037, 'Mazda', null),
('DREJ3R', 2025, 101039, 101039, 'Mazda', null),
('DRH3R', 2025, 100011, 100017, 'Mazda', null),
('DR8V3R', 2025, 100101, 100236, 'Mazda', null),
('KFEP', 2025, 610197, 619079, 'Mazda', null),
('KFEP', 2025, 619081, 619099, 'Mazda', null),
('KFEP', 2025, 619101, 619144, 'Mazda', null),
('KFEP', 2025, 619146, 619186, 'Mazda', null),
('KFEP', 2025, 619188, 619218, 'Mazda', null),
('KFEP', 2025, 619220, 619228, 'Mazda', null),
('KFEP', 2025, 619230, 619231, 'Mazda', null),
('KFEP', 2025, 619233, 619240, 'Mazda', null),
('KF2P', 2025, 614987, 614988, 'Mazda', null),
('KF2P', 2025, 614991, 627681, 'Mazda', null),
('KF2P', 2025, 627683, 627969, 'Mazda', null),
('KF2P', 2025, 627971, 628253, 'Mazda', null),
('KF2P', 2025, 628255, 628278, 'Mazda', null),
('KF2P', 2025, 628280, 628285, 'Mazda', null),
('KF5P', 2025, 603031, 604792, 'Mazda', null),
('KH3P', 2025, 200005, 205457, 'Mazda', null),
('KH3P', 2025, 205459, 205599, 'Mazda', null),
('KH3P', 2025, 205601, 205613, 'Mazda', null),
('KH3P', 2025, 205615, 205638, 'Mazda', null),
('KH3P', 2025, 205640, 205642, 'Mazda', null),
('KH3P', 2025, 205644, 205644, 'Mazda', null),
('KH3P', 2025, 205647, 205650, 'Mazda', null),
('KH3R3P', 2025, 200006, 203387, 'Mazda', null),
('KH3R3P', 2025, 203389, 203414, 'Mazda', null),
('KH3R3P', 2025, 203416, 203427, 'Mazda', null),
('KH3R3P', 2025, 203429, 203432, 'Mazda', null),
('KH5P', 2025, 200003, 202337, 'Mazda', null),
('KH5S3P', 2025, 200003, 200149, 'Mazda', null),
('KL3P', 2025, 104360, 104360, 'Mazda', null),
('KL3P', 2025, 104371, 104371, 'Mazda', null),
('KL3P', 2025, 104386, 104386, 'Mazda', null),
('KL3P', 2025, 104420, 104420, 'Mazda', null),
('KL3P', 2025, 104440, 104440, 'Mazda', null),
('KL3P', 2025, 104450, 104450, 'Mazda', null),
('KL3P', 2025, 104454, 104454, 'Mazda', null),
('KL3P', 2025, 104481, 104482, 'Mazda', null),
('KL3P', 2025, 104484, 104485, 'Mazda', null),
('KL3P', 2025, 104487, 104489, 'Mazda', null),
('KL3P', 2025, 104492, 110308, 'Mazda', null),
('KL3P', 2025, 110310, 110331, 'Mazda', null),
('KL3R3P', 2025, 103758, 103758, 'Mazda', null),
('KL3R3P', 2025, 103988, 103988, 'Mazda', null),
('KL3R3P', 2025, 104321, 104321, 'Mazda', null),
('KL3R3P', 2025, 104329, 106593, 'Mazda', null),
('KL3R3P', 2025, 106595, 106597, 'Mazda', null),
('KL5S3P', 2025, 100462, 100551, 'Mazda', null),
('NDERE', 2025, 150030, 150030, 'Mazda', null),
('NDERE', 2025, 150086, 153002, 'Mazda', null),
('NDERE', 2025, 153004, 153054, 'Mazda', null),
('NDERE', 2025, 200006, 200230, 'Mazda', null),
('NDERE', 2025, 200232, 200259, 'Mazda', null),
('NDERE', 2025, 200262, 200265, 'Mazda', null),
('NDERE', 2025, 200267, 200268, 'Mazda', null),
('NDERE', 2025, 200271, 200271, 'Mazda', null),
('ND5RE', 2025, 150033, 150033, 'Mazda', null),
('ND5RE', 2025, 150045, 150045, 'Mazda', null),
('ND5RE', 2025, 150047, 150047, 'Mazda', null),
('ND5RE', 2025, 150060, 150060, 'Mazda', null),
('ND5RE', 2025, 150070, 150070, 'Mazda', null),
('ND5RE', 2025, 150072, 150072, 'Mazda', null),
('ND5RE', 2025, 150076, 150076, 'Mazda', null),
('ND5RE', 2025, 150081, 150081, 'Mazda', null),
('ND5RE', 2025, 150086, 150086, 'Mazda', null),
('ND5RE', 2025, 150096, 150096, 'Mazda', null),
('ND5RE', 2025, 150098, 150098, 'Mazda', null),
('ND5RE', 2025, 150111, 150111, 'Mazda', null),
('ND5RE', 2025, 150119, 150119, 'Mazda', null),
('ND5RE', 2025, 150121, 157772, 'Mazda', null),
('ND5RE', 2025, 157774, 158047, 'Mazda', null),
('ND5RE', 2025, 158050, 158050, 'Mazda', null),
('CV1W', 2024, 5003013, 5022629, 'Mitsubishi', null),
('GA4W', 2024, 5600540, 5601199, 'Mitsubishi', null),
('GK1W', 2024, 700205, 703056, 'Mitsubishi', null),
('GL3W', 2024, 700763, 704974, 'Mitsubishi', null),
('GN0W', 2024, 400707, 404646, 'Mitsubishi', null),
('GN0W', 2024, 500101, 504413, 'Mitsubishi', null),
('B33W', 2024, 402130, 405023, 'Mitsubishi', null),
('B33W', 2024, 500001, 502942, 'Mitsubishi', null),
('B34A', 2024, 507875, 514149, 'Mitsubishi', null),
('B34A', 2024, 600001, 610740, 'Mitsubishi', null),
('B34W', 2024, 400630, 401197, 'Mitsubishi', null),
('B34W', 2024, 500001, 500719, 'Mitsubishi', null),
('B35A', 2024, 506182, 511050, 'Mitsubishi', null),
('B35A', 2024, 600001, 606727, 'Mitsubishi', null),
('B35W', 2024, 400474, 400758, 'Mitsubishi', null),
('B35W', 2024, 500001, 500500, 'Mitsubishi', null),
('B36W', 2024, 400779, 401510, 'Mitsubishi', null),
('B36W', 2024, 500001, 500780, 'Mitsubishi', null),
('B37A', 2024, 503265, 505393, 'Mitsubishi', null),
('B37A', 2024, 600001, 603089, 'Mitsubishi', null),
('B37W', 2024, 400307, 400494, 'Mitsubishi', null),
('B37W', 2024, 500001, 500319, 'Mitsubishi', null),
('B38A', 2024, 511806, 519502, 'Mitsubishi', null),
('B38A', 2024, 600001, 608297, 'Mitsubishi', null),
('B38W', 2024, 400307, 400498, 'Mitsubishi', null),
('B38W', 2024, 500001, 500410, 'Mitsubishi', null),
('B43W', 2024, 405379, 416259, 'Nissan', null),
('B43W', 2024, 500001, 510707, 'Nissan', null),
('B44A', 2024, 525761, 540251, 'Nissan', null),
('B44A', 2024, 600001, 628337, 'Nissan', null),
('B44W', 2024, 403152, 410673, 'Nissan', null),
('B44W', 2024, 500001, 507561, 'Nissan', null),
('B45A', 2024, 512071, 518408, 'Nissan', null),
('B45A', 2024, 600001, 610901, 'Nissan', null),
('B45W', 2024, 402547, 404487, 'Nissan', null),
('B45W', 2024, 500001, 502102, 'Nissan', null),
('B46W', 2024, 401350, 403583, 'Nissan', null),
('B46W', 2024, 500001, 502057, 'Nissan', null),
('B47A', 2024, 504621, 507017, 'Nissan', null),
('B47A', 2024, 600001, 604221, 'Nissan', null),
('B47W', 2024, 400901, 402320, 'Nissan', null),
('B47W', 2024, 500001, 501457, 'Nissan', null),
('B48A', 2024, 502751, 504037, 'Nissan', null),
('B48A', 2024, 600001, 602340, 'Nissan', null),
('B48W', 2024, 400967, 401311, 'Nissan', null),
('B48W', 2024, 500001, 500702, 'Nissan', null),
('B5AW', 2024, 11968, 13105, 'Mitsubishi', null),
('B5AW', 2024, 100001, 101570, 'Mitsubishi', null),
('B6AW', 2024, 65055, 74834, 'Nissan', null),
('B6AW', 2024, 100001, 118046, 'Nissan', null),
('U69V', 2024, 559, 1496, 'Mitsubishi', null),
('U69V', 2024, 100001, 104384, 'Mitsubishi', null),
('U79V', 2024, 1, 464, 'Nissan', null),
('U79V', 2024, 100001, 100313, 'Nissan', null),
('LC2T', 2024, 201, 4790, 'Mitsubishi', null),
('CV1W', 2025, 5022630, 5045605, 'Mitsubishi', null),
('CV1W', 2025, 6000101, 6000718, 'Mitsubishi', null),
('GK1W', 2025, 703057, 707434, 'Mitsubishi', null),
('GL3W', 2025, 704975, 708942, 'Mitsubishi', null),
('GN0W', 2025, 504414, 510404, 'Mitsubishi', null),
('GN0W', 2025, 600101, 602100, 'Mitsubishi', null),
('B33W', 2025, 502943, 506049, 'Mitsubishi', null),
('B33W', 2025, 600001, 605055, 'Mitsubishi', null),
('B34A', 2025, 610741, 623681, 'Mitsubishi', null),
('B34W', 2025, 500720, 501247, 'Mitsubishi', null),
('B34W', 2025, 600001, 600689, 'Mitsubishi', null),
('B35A', 2025, 606728, 614902, 'Mitsubishi', null),
('B35W', 2025, 500501, 500794, 'Mitsubishi', null),
('B35W', 2025, 600001, 600492, 'Mitsubishi', null),
('B36W', 2025, 500781, 501602, 'Mitsubishi', null),
('B36W', 2025, 600001, 600876, 'Mitsubishi', null),
('B37A', 2025, 603090, 606707, 'Mitsubishi', null),
('B37W', 2025, 500320, 500451, 'Mitsubishi', null),
('B37W', 2025, 600001, 600317, 'Mitsubishi', null),
('B38A', 2025, 608298, 617640, 'Mitsubishi', null),
('B38W', 2025, 500411, 500557, 'Mitsubishi', null),
('B38W', 2025, 600001, 600365, 'Mitsubishi', null),
('B43W', 2025, 510708, 521533, 'Nissan', null),
('B43W', 2025, 600001, 612936, 'Nissan', null),
('B44A', 2025, 628338, 656220, 'Nissan', null),
('B44W', 2025, 507562, 514233, 'Nissan', null),
('B44W', 2025, 600001, 606930, 'Nissan', null),
('B45A', 2025, 610902, 621911, 'Nissan', null),
('B45W', 2025, 502103, 504141, 'Nissan', null),
('B45W', 2025, 600001, 602008, 'Nissan', null),
('B46W', 2025, 502058, 504175, 'Nissan', null),
('B46W', 2025, 600001, 602161, 'Nissan', null),
('B47A', 2025, 604222, 608891, 'Nissan', null),
('B47W', 2025, 501458, 502602, 'Nissan', null),
('B47W', 2025, 600001, 601218, 'Nissan', null),
('B48A', 2025, 602341, 604196, 'Nissan', null),
('B48W', 2025, 500703, 501126, 'Nissan', null),
('B48W', 2025, 600001, 600495, 'Nissan', null),
('B5AW', 2025, 101571, 102695, 'Mitsubishi', null),
('B6AW', 2025, 118047, 124830, 'Nissan', null),
('BA1A', 2025, 1, 4760, 'Mitsubishi', null),
('BA2A', 2025, 1, 4483, 'Mitsubishi', null),
('BA5A', 2025, 1, 1734, 'Mitsubishi', null),
('BA6A', 2025, 1, 7898, 'Mitsubishi', null),
('BB1A', 2025, 1, 21598, 'Nissan', null),
('BB2A', 2025, 1, 10069, 'Nissan', null),
('BB5A', 2025, 1, 3472, 'Nissan', null),
('BB6A', 2025, 1, 1833, 'Nissan', null),
('U69V', 2025, 104385, 106973, 'Mitsubishi', null),
('U79V', 2025, 100314, 100426, 'Nissan', null),
('LC2T', 2025, 1911, 7258, 'Mitsubishi', null),
('C28', 2024, 6302, 10544, 'Nissan', null),
('FC28', 2024, 26229, 33993, 'Nissan', null),
('NC28', 2024, 1929, 3728, 'Nissan', null),
('FNC28', 2024, 5875, 8126, 'Nissan', null),
('GC28', 2024, 5248, 11916, 'Nissan', null),
('GFC28', 2024, 45632, 94395, 'Nissan', null),
('SNC28', 2024, 1, 327, 'Nissan', null),
('SFNC28', 2024, 1, 3408, 'Nissan', null),
('E13', 2024, 282934, 333393, 'Nissan', null),
('FE13', 2024, 370335, 381185, 'Nissan', null),
('FE13', 2024, 400018, 422916, 'Nissan', null),
('FSNE13', 2024, 576093, 577997, 'Nissan', null),
('FSNE13', 2024, 590020, 596595, 'Nissan', null),
('SNE13', 2024, 210791, 219033, 'Nissan', null),
('KS2E26', 2024, 122256, 122587, 'Nissan', null),
('KS2E26', 2024, 130001, 130689, 'Nissan', null),
('KS4E26', 2024, 105363, 105409, 'Nissan', null),
('KS4E26', 2024, 110003, 110114, 'Nissan', null),
('VR2E26', 2024, 171375, 173475, 'Nissan, Isuzu', 'shared common sequence'),
('VR2E26', 2024, 200003, 204461, 'Nissan, Isuzu', 'shared common sequence'),
('CS4E26', 2024, 118432, 118813, 'Nissan, Isuzu', 'shared common sequence'),
('CS4E26', 2024, 130004, 130887, 'Nissan, Isuzu', 'shared common sequence'),
('DS4E26', 2024, 105542, 105582, 'Nissan', null),
('DS4E26', 2024, 110002, 110177, 'Nissan', null),
('CS8E26', 2024, 6504, 6632, 'Nissan, Isuzu', 'shared common sequence'),
('CS8E26', 2024, 10003, 10510, 'Nissan, Isuzu', 'shared common sequence'),
('DS8E26', 2024, 5400, 5439, 'Nissan', null),
('DS8E26', 2024, 10002, 10177, 'Nissan', null),
('KS6E26', 2024, 356, 396, 'Nissan', null),
('KS6E26', 2024, 5001, 5159, 'Nissan', null),
('KS8E26', 2024, 74, 85, 'Nissan', null),
('KS8E26', 2024, 5001, 5037, 'Nissan', null),
('VN2E26', 2024, 10107, 11567, 'Nissan, Isuzu', 'shared common sequence'),
('VN2E26', 2024, 25002, 28093, 'Nissan, Isuzu', 'shared common sequence'),
('VN2E26', 2024, 800101, 800117, 'Nissan, Isuzu', 'shared common sequence'),
('VN2E26', 2024, 801001, 801023, 'Nissan, Isuzu', 'shared common sequence'),
('CN4E26', 2024, 434, 509, 'Nissan, Isuzu', 'shared common sequence'),
('CN4E26', 2024, 5002, 5139, 'Nissan, Isuzu', 'shared common sequence'),
('VN6E26', 2024, 9282, 10600, 'Nissan, Isuzu', 'shared common sequence'),
('VN6E26', 2024, 20001, 23372, 'Nissan, Isuzu', 'shared common sequence'),
('CN8E26', 2024, 838, 922, 'Nissan, Isuzu', 'shared common sequence'),
('CN8E26', 2024, 5005, 5317, 'Nissan, Isuzu', 'shared common sequence'),
('TE52', 2024, 161678, 161928, 'Nissan', null),
('TE52', 2024, 170003, 170626, 'Nissan', null),
('TNE52', 2024, 80516, 80568, 'Nissan', null),
('TNE52', 2024, 85003, 85255, 'Nissan', null),
('PE52', 2024, 90323, 90355, 'Nissan', null),
('PE52', 2024, 95001, 95131, 'Nissan', null),
('PNE52', 2024, 80261, 80299, 'Nissan', null),
('PNE52', 2024, 85004, 85101, 'Nissan', null),
('FE0', 2024, 150005, 151382, 'Nissan', null),
('SNFE0', 2024, 250010, 252125, 'Nissan', null),
('M20', 2024, 43183, 43481, 'Nissan', null),
('M20', 2024, 50010, 51012, 'Nissan', null),
('VM20', 2024, 209468, 212059, 'Nissan', null),
('VM20', 2024, 235011, 241841, 'Nissan', null),
('VNM20', 2024, 117137, 117660, 'Nissan', null),
('VNM20', 2024, 125012, 126142, 'Nissan', null),
('SNP15', 2024, 10601, 15146, 'Nissan', null),
('RP15', 2024, 15473, 26508, 'Nissan', null),
('R35', 2024, 161081, 161501, 'Nissan', null),
('R35', 2024, 170001, 170694, 'Nissan', null),
('T33', 2024, 4299, 5100, 'Nissan', null),
('T33', 2024, 5107, 6485, 'Nissan', null),
('T33', 2024, 17001, 17002, 'Nissan', null),
('T33', 2024, 17101, 19438, 'Nissan', null),
('SNT33', 2024, 37453, 49292, 'Nissan', null),
('SNT33', 2024, 50117, 53546, 'Nissan', null),
('SNT33', 2024, 74001, 86157, 'Nissan', null),
('RV37', 2024, 192803, 193516, 'Nissan', null),
('RV37', 2024, 220006, 221132, 'Nissan', null),
('VY12', 2024, 355016, 360489, 'Nissan', null),
('VZNY12', 2024, 107217, 107289, 'Nissan', null),
('VZNY12', 2024, 115014, 116878, 'Nissan', null),
('RZ34', 2024, 120940, 125114, 'Nissan', 'shared common sequence'),
('RZ34', 2024, 140001, 140004, 'Nissan', 'shared common sequence'),
('ZE1', 2024, 251049, 255668, 'Nissan', null),
('C28', 2025, 10545, 16353, 'Nissan', null),
('C28', 2025, 17001, 17105, 'Nissan', null),
('FC28', 2025, 33994, 41490, 'Nissan', null),
('FC28', 2025, 50001, 50265, 'Nissan', null),
('NC28', 2025, 3729, 5485, 'Nissan', null),
('NC28', 2025, 6501, 6602, 'Nissan', null),
('FNC28', 2025, 8127, 9810, 'Nissan', null),
('FNC28', 2025, 13501, 13643, 'Nissan', null),
('GC28', 2025, 11917, 17483, 'Nissan', null),
('GC28', 2025, 19001, 19204, 'Nissan', null),
('GFC28', 2025, 94396, 138975, 'Nissan', null),
('GFC28', 2025, 160001, 161735, 'Nissan', null),
('SNC28', 2025, 328, 1378, 'Nissan', null),
('SNC28', 2025, 1501, 1601, 'Nissan', null),
('SFNC28', 2025, 3409, 9784, 'Nissan', null),
('SFNC28', 2025, 14501, 15076, 'Nissan', null),
('E13', 2025, 333394, 358566, 'Nissan', null),
('E13', 2025, 380001, 394391, 'Nissan', null),
('FE13', 2025, 422917, 437452, 'Nissan', null),
('FE13', 2025, 450001, 458820, 'Nissan', null),
('FSNE13', 2025, 596596, 599408, 'Nissan', null),
('FSNE13', 2025, 610001, 611670, 'Nissan', null),
('SNE13', 2025, 219034, 223646, 'Nissan', null),
('SNE13', 2025, 230001, 232177, 'Nissan', null),
('KS2E26', 2025, 130690, 131213, 'Nissan', null),
('KS2E26', 2025, 140001, 140176, 'Nissan', null),
('KS4E26', 2025, 110115, 110243, 'Nissan', null),
('KS4E26', 2025, 113001, 113039, 'Nissan', null),
('VR2E26', 2025, 204462, 209804, 'Nissan, Isuzu', 'shared common sequence'),
('VR2E26', 2025, 220001, 222299, 'Nissan, Isuzu', 'shared common sequence'),
('CS4E26', 2025, 130888, 131838, 'Nissan, Isuzu', 'shared common sequence'),
('CS4E26', 2025, 140001, 140800, 'Nissan, Isuzu', 'shared common sequence'),
('DS4E26', 2025, 110178, 110312, 'Nissan', null),
('DS4E26', 2025, 115001, 115080, 'Nissan', null),
('CS8E26', 2025, 10511, 10767, 'Nissan, Isuzu', 'shared common sequence'),
('CS8E26', 2025, 14001, 14601, 'Nissan, Isuzu', 'shared common sequence'),
('DS8E26', 2025, 10178, 10341, 'Nissan', null),
('DS8E26', 2025, 15001, 15069, 'Nissan', null),
('KS6E26', 2025, 5160, 5274, 'Nissan', null),
('KS6E26', 2025, 8001, 8076, 'Nissan', null),
('KS8E26', 2025, 5038, 5067, 'Nissan', null),
('KS8E26', 2025, 6001, 6024, 'Nissan', null),
('VN2E26', 2025, 28094, 30426, 'Nissan, Isuzu', 'shared common sequence'),
('VN2E26', 2025, 40001, 42325, 'Nissan, Isuzu', 'shared common sequence'),
('VN2E26', 2025, 801024, 801073, 'Nissan, Isuzu', 'shared common sequence'),
('VN2E26', 2025, 802001, 802005, 'Nissan, Isuzu', 'shared common sequence'),
('CN4E26', 2025, 5140, 5273, 'Nissan, Isuzu', 'shared common sequence'),
('CN4E26', 2025, 10001, 10103, 'Nissan, Isuzu', 'shared common sequence'),
('VN6E26', 2025, 23373, 25911, 'Nissan, Isuzu', 'shared common sequence'),
('VN6E26', 2025, 35001, 37134, 'Nissan, Isuzu', 'shared common sequence'),
('CN8E26', 2025, 5318, 5493, 'Nissan, Isuzu', 'shared common sequence'),
('CN8E26', 2025, 8001, 8268, 'Nissan, Isuzu', 'shared common sequence'),
('TE52', 2025, 170627, 171774, 'Nissan', null),
('TNE52', 2025, 85256, 85408, 'Nissan', null),
('PE52', 2025, 95132, 95225, 'Nissan', null),
('PNE52', 2025, 85102, 85248, 'Nissan', null),
('FE0', 2025, 151383, 151506, 'Nissan', null),
('FE0', 2025, 220001, 220160, 'Nissan', null),
('FE0', 2025, 230001, 230034, 'Nissan', null),
('SNFE0', 2025, 252126, 252210, 'Nissan', null),
('SNFE0', 2025, 320001, 320110, 'Nissan', null),
('SNFE0', 2025, 330001, 330054, 'Nissan', null),
('M20', 2025, 51013, 52031, 'Nissan', null),
('M20', 2025, 55001, 55174, 'Nissan', null),
('VM20', 2025, 241842, 249496, 'Nissan', null),
('VM20', 2025, 260001, 261864, 'Nissan', null),
('VNM20', 2025, 126143, 128700, 'Nissan', null),
('VNM20', 2025, 135001, 135304, 'Nissan', null),
('SNP15', 2025, 15147, 16749, 'Nissan', null),
('RP15', 2025, 26509, 32410, 'Nissan', null),
('R35', 2025, 170695, 171512, 'Nissan', null),
('T33', 2025, 19439, 21390, 'Nissan', null),
('T33', 2025, 24801, 25334, 'Nissan', null),
('SNT33', 2025, 86158, 97501, 'Nissan', null),
('SNT33', 2025, 108401, 116332, 'Nissan', null),
('RV37', 2025, 221133, 222136, 'Nissan', null),
('RV37', 2025, 240001, 240163, 'Nissan', null),
('VY12', 2025, 360490, 365841, 'Nissan', null),
('VZNY12', 2025, 116879, 119223, 'Nissan', null),
('RZ34', 2025, 140007, 145990, 'Nissan', 'shared common sequence'),
('RZ34', 2025, 160001, 160039, 'Nissan', 'shared common sequence'),
('ZE1', 2025, 255669, 258215, 'Nissan', null),
('ZE2', 2025, 100001, 102023, 'Nissan', null),
('FF21S', 2024, 402032, 402757, 'Suzuki', null),
('JB74W', 2024, 207256, 214455, 'Suzuki', null),
('JB74W', 2024, 220001, 239332, 'Suzuki', null),
('MA27S', 2024, 123653, 130213, 'Suzuki', null),
('MA37S', 2024, 174982, 199285, 'Suzuki', null),
('MA37S', 2024, 659149, 671609, 'Suzuki', null),
('MA47S', 2024, 112518, 115215, 'Suzuki', null),
('MA47S', 2024, 611588, 613316, 'Suzuki', null),
('MB37S', 2024, 111841, 115117, 'Mitsubishi', null),
('MB37S', 2024, 611108, 612637, 'Mitsubishi', null),
('MAD7S', 2024, 100001, 102302, 'Suzuki', null),
('MAD7S', 2024, 600001, 601788, 'Suzuki', null),
('MBD7S', 2024, 100001, 100210, 'Mitsubishi', null),
('MBD7S', 2024, 600001, 600133, 'Mitsubishi', null),
('MN71S', 2024, 401058, 413736, 'Suzuki', null),
('ZC33S', 2024, 603922, 611443, 'Suzuki', null),
('ZC33S', 2024, 700001, 700002, 'Suzuki', null),
('ZCDDS', 2024, 101105, 105635, 'Suzuki', null),
('ZCEDS', 2024, 102710, 117913, 'Suzuki', null),
('ZDDDS', 2024, 100224, 101146, 'Suzuki', null),
('ZDEDS', 2024, 100572, 103767, 'Suzuki', null),
('DA17W', 2024, 331450, 332734, 'Suzuki', null),
('DA17W', 2024, 341001, 358346, 'Suzuki', null),
('DG17W', 2024, 302231, 302335, 'Mazda', null),
('DG17W', 2024, 341001, 341938, 'Mazda', null),
('DR17W', 2024, 309604, 310178, 'Nissan', null),
('DR17W', 2024, 341001, 346252, 'Nissan', null),
('DS17W', 2024, 301004, 301052, 'Mitsubishi', null),
('DS17W', 2024, 341001, 341436, 'Mitsubishi', null),
('HA37S', 2024, 162103, 188544, 'Suzuki', null),
('HB37S', 2024, 160193, 162582, 'Mazda', null),
('HA97S', 2024, 161312, 175112, 'Suzuki', null),
('HB97S', 2024, 160135, 161752, 'Mazda', null),
('HE33S', 2024, 502662, 529370, 'Suzuki', null),
('JB64W', 2024, 320578, 330284, 'Suzuki', null),
('JB64W', 2024, 340001, 372244, 'Suzuki', null),
('MH55S', 2024, 941150, 943445, 'Suzuki', null),
('MH85S', 2024, 196099, 218655, 'Suzuki', null),
('MH95S', 2024, 265729, 280572, 'Suzuki', null),
('MJ55S', 2024, 210088, 210295, 'Mazda', null),
('MJ95S', 2024, 130995, 134003, 'Mazda', null),
('MK33V', 2024, 200620, 206744, 'Suzuki', 'shared common sequence'),
('MK54S', 2024, 105550, 149467, 'Suzuki', null),
('MK94S', 2024, 120341, 245462, 'Suzuki', null),
('MM54S', 2024, 100243, 103916, 'Mazda', null),
('MM94S', 2024, 101293, 113134, 'Mazda', null),
('MR52S', 2024, 336844, 343842, 'Suzuki', null),
('MR52S', 2024, 450001, 466786, 'Suzuki', null),
('MR92S', 2024, 397309, 421191, 'Suzuki', null),
('MR92S', 2024, 450001, 496026, 'Suzuki', null),
('MS52S', 2024, 302293, 302694, 'Mazda', null),
('MS52S', 2024, 450001, 451052, 'Mazda', null),
('MS92S', 2024, 307843, 309706, 'Mazda', null),
('MS92S', 2024, 450001, 453802, 'Mazda', null),
('MX81S', 2024, 201867, 206237, 'Suzuki', null),
('MX81S', 2024, 300001, 300493, 'Suzuki', null),
('MX91S', 2024, 215870, 242452, 'Suzuki', null),
('MX91S', 2024, 300001, 303840, 'Suzuki', null),
('DA16T', 2024, 790604, 803127, 'Suzuki', null),
('DA16T', 2024, 820001, 859748, 'Suzuki', null),
('DG16T', 2024, 693567, 693918, 'Mazda', null),
('DG16T', 2024, 820001, 821289, 'Mazda', null),
('DR16T', 2024, 707152, 709424, 'Nissan', null),
('DR16T', 2024, 820001, 826817, 'Nissan', null),
('DS16T', 2024, 695138, 695996, 'Mitsubishi', null),
('DS16T', 2024, 820001, 821766, 'Mitsubishi', null),
('DA17V', 2024, 720733, 726218, 'Suzuki', 'shared common sequence'),
('DA17V', 2024, 740001, 779189, 'Suzuki', 'shared common sequence'),
('DA17V', 2024, 890001, 905721, 'Suzuki', 'shared common sequence'),
('DG17V', 2024, 618685, 619104, 'Mazda', 'shared common sequence'),
('DG17V', 2024, 740001, 742931, 'Mazda', 'shared common sequence'),
('DG17V', 2024, 890001, 891179, 'Mazda', 'shared common sequence'),
('DR17V', 2024, 659141, 661286, 'Nissan', 'shared common sequence'),
('DR17V', 2024, 740001, 759310, 'Nissan', 'shared common sequence'),
('DR17V', 2024, 890001, 895733, 'Nissan', 'shared common sequence'),
('DS17V', 2024, 617308, 617513, 'Mitsubishi', 'shared common sequence'),
('DS17V', 2024, 740001, 743063, 'Mitsubishi', 'shared common sequence'),
('DS17V', 2024, 890001, 891156, 'Mitsubishi', 'shared common sequence'),
('EF11M', 2024, 101171, 101244, 'Suzuki', null),
('EJ11A', 2024, 104311, 105217, 'Suzuki', null),
('DU11N', 2024, 100734, 101003, 'Suzuki', null),
('EK1AA', 2024, 103985, 105491, 'Suzuki', null),
('C733M', 2024, 101173, 101541, 'Suzuki', null),
('VP55E', 2024, 102669, 103373, 'Suzuki', null),
('EM1AA', 2024, 101235, 103114, 'Suzuki', null),
('EM1BA', 2024, 100937, 101160, 'Suzuki', null),
('JB74W', 2025, 239333, 252847, 'Suzuki', null),
('JB74W', 2025, 260001, 262443, 'Suzuki', null),
('MAD7S', 2025, 102303, 131452, 'Suzuki', null),
('MAD7S', 2025, 601789, 624443, 'Suzuki', null),
('MBD7S', 2025, 100211, 102917, 'Mitsubishi', null),
('MBD7S', 2025, 600134, 602310, 'Mitsubishi', null),
('MN71S', 2025, 413737, 421335, 'Suzuki', null),
('MND1S', 2025, 100064, 108338, 'Suzuki', null),
('ZC33S', 2025, 611444, 612863, 'Suzuki', null),
('ZC33S', 2025, 700003, 708505, 'Suzuki', null),
('ZCEDS', 2025, 117914, 126781, 'Suzuki', null),
('ZCDDS', 2025, 103768, 105750, 'Suzuki', null),
('ZDEDS', 2025, 105636, 109546, 'Suzuki', null),
('ZDDDS', 2025, 101147, 101990, 'Suzuki', null),
('DA17W', 2025, 358347, 378252, 'Suzuki', null),
('DG17W', 2025, 341939, 343115, 'Mazda', null),
('DR17W', 2025, 346253, 352197, 'Nissan', null),
('DS17W', 2025, 341437, 341855, 'Mitsubishi', null),
('HA37S', 2025, 188545, 198122, 'Suzuki', null),
('HA37S', 2025, 210001, 221283, 'Suzuki', null),
('HB37S', 2025, 162583, 163633, 'Mazda', null),
('HB37S', 2025, 210001, 211524, 'Mazda', null),
('HA97S', 2025, 175113, 180357, 'Suzuki', null),
('HA97S', 2025, 210001, 218255, 'Suzuki', null),
('HB97S', 2025, 161753, 162367, 'Mazda', null),
('HB97S', 2025, 210001, 210911, 'Mazda', null),
('HE33S', 2025, 529371, 544806, 'Suzuki', null),
('HE93S', 2025, 100057, 111161, 'Suzuki', null),
('JB64W', 2025, 372245, 412668, 'Suzuki', null),
('JB64W', 2025, 430001, 439427, 'Suzuki', null),
('JB64W', 2025, 439532, 439537, 'Suzuki', null),
('MH55S', 2025, 943446, 945176, 'Suzuki', null),
('MH85S', 2025, 218656, 237840, 'Suzuki', null),
('MH85S', 2025, 300001, 301974, 'Suzuki', null),
('MH95S', 2025, 280573, 294014, 'Suzuki', null),
('MH95S', 2025, 300001, 301301, 'Suzuki', null),
('MJ55S', 2025, 210296, 210507, 'Mazda', null),
('MJ85S', 2025, 100001, 100092, 'Mazda', null),
('MJ95S', 2025, 134004, 136664, 'Mazda', null),
('MJ95S', 2025, 300001, 300226, 'Mazda', null),
('MK33V', 2025, 206745, 211490, 'Suzuki', null),
('MK54S', 2025, 149468, 191046, 'Suzuki', null),
('MK94S', 2025, 245463, 369878, 'Suzuki', null),
('MM54S', 2025, 103917, 107730, 'Mazda', null),
('MM94S', 2025, 113135, 123963, 'Mazda', null),
('MR52S', 2025, 466787, 487657, 'Suzuki', null),
('MR92S', 2025, 496027, 562690, 'Suzuki', null),
('MS52S', 2025, 451053, 452245, 'Mazda', null),
('MS92S', 2025, 453803, 458444, 'Mazda', null),
('MX81S', 2025, 300494, 304565, 'Suzuki', null),
('MX91S', 2025, 303841, 334996, 'Suzuki', null),
('DA16T', 2025, 859749, 906271, 'Suzuki', null),
('DA16T', 2025, 910002, 910007, 'Suzuki', null),
('DG16T', 2025, 821290, 823054, 'Mazda', null),
('DR16T', 2025, 826818, 834596, 'Nissan', null),
('DS16T', 2025, 821767, 824261, 'Mitsubishi', null),
('DA17V', 2025, 905722, 965001, 'Suzuki', 'shared common sequence'),
('DG17V', 2025, 891180, 895633, 'Mazda', 'shared common sequence'),
('DR17V', 2025, 895734, 916942, 'Nissan', 'shared common sequence'),
('DS17V', 2025, 891157, 894776, 'Mitsubishi', 'shared common sequence'),
('EF11M', 2025, 101245, 101314, 'Suzuki', null),
('EJ11A', 2025, 105218, 105913, 'Suzuki', null),
('DU11N', 2025, 101004, 101226, 'Suzuki', null),
('EK1AA', 2025, 105492, 106364, 'Suzuki', null),
('C733M', 2025, 101542, 102300, 'Suzuki', null),
('VP55E', 2025, 103374, 104722, 'Suzuki', null),
('EM1AA', 2025, 103115, 104243, 'Suzuki', null),
('EM1BA', 2025, 101161, 101496, 'Suzuki', null),
('ER1AH', 2025, 100015, 101156, 'Suzuki', null),
('LA400K', 2025, 60115, 64867, 'Daihatsu', null),
('LA400A', 2025, 8082, 9172, 'Daihatsu, Toyota', null),
('M900S', 2025, 1016824, 1022854, 'Daihatsu', 'shared common sequence'),
('M910S', 2025, 1003090, 1004386, 'Daihatsu', null),
('M900A', 2025, 1169909, 1253512, 'Daihatsu, Toyota', 'shared common sequence'),
('M910A', 2025, 1031507, 1045757, 'Daihatsu, Toyota', null),
('M900F', 2025, 1501680, 1502288, 'Daihatsu, Subaru', null),
('M910F', 2025, 1501021, 1501468, 'Daihatsu, Subaru', null),
('A201S', 2025, 17075, 21483, 'Daihatsu', null),
('A202S', 2025, 28142, 37269, 'Daihatsu', null),
('A210S', 2025, 24992, 27754, 'Daihatsu', null),
('A201A', 2025, 97601, 128672, 'Daihatsu, Toyota', null),
('A202A', 2025, 77883, 133246, 'Daihatsu, Toyota', null),
('A210A', 2025, 89100, 106516, 'Daihatsu, Toyota', null),
('A201F', 2025, 4722, 6569, 'Daihatsu, Subaru', null),
('A202F', 2025, 53, 1768, 'Daihatsu, Subaru', null),
('A210F', 2025, 53, 270, 'Daihatsu, Subaru', null),
('LA650S', 2025, 486138, 581898, 'Daihatsu', null),
('LA660S', 2025, 120933, 141837, 'Daihatsu', null),
('LA650F', 2025, 17396, 20204, 'Daihatsu, Subaru', null),
('LA660F', 2025, 7835, 9088, 'Daihatsu, Subaru', null),
('S403M', 2025, 29486, 35556, 'Daihatsu, Toyota', null),
('S413M', 2025, 16652, 20576, 'Daihatsu, Toyota', null),
('S403V', 2025, 1165, 1310, 'Daihatsu', null),
('S413V', 2025, 592, 691, 'Daihatsu', null),
('S403Z', 2025, 7002661, 7002995, 'Daihatsu, Mazda', null),
('S413Z', 2025, 7001329, 7001485, 'Daihatsu, Mazda', null),
('LA350S', 2025, 425979, 471933, 'Daihatsu', null),
('LA360S', 2025, 82601, 92567, 'Daihatsu', null),
('LA350A', 2025, 52567, 59985, 'Daihatsu, Toyota', null),
('LA360A', 2025, 13416, 14949, 'Daihatsu, Toyota', null),
('LA350F', 2025, 21558, 23352, 'Daihatsu, Subaru', null),
('LA360F', 2025, 7983, 8562, 'Daihatsu, Subaru', null),
('LA900S', 2025, 202522, 239365, 'Daihatsu', null),
('LA910S', 2025, 62262, 74037, 'Daihatsu', null),
('S500P', 2025, 200567, 216337, 'Daihatsu', null),
('S510P', 2025, 607631, 669646, 'Daihatsu', null),
('S500U', 2025, 12001, 12969, 'Daihatsu, Toyota', null),
('S510U', 2025, 30121, 32977, 'Daihatsu, Toyota', null),
('S500J', 2025, 10099, 10438, 'Daihatsu, Subaru', null),
('S510J', 2025, 47298, 49185, 'Daihatsu, Subaru', null),
('S700V', 2025, 146171, 192054, 'Daihatsu', 'shared common sequence'),
('S710V', 2025, 101036, 131662, 'Daihatsu', 'shared common sequence'),
('S700B', 2025, 4883, 6290, 'Daihatsu, Subaru', 'shared common sequence'),
('S710B', 2025, 6003, 7571, 'Daihatsu, Subaru', 'shared common sequence'),
('S700M', 2025, 15862, 21995, 'Daihatsu, Toyota', 'shared common sequence'),
('S710M', 2025, 9845, 13395, 'Daihatsu, Toyota', 'shared common sequence'),
('S700W', 2025, 3938, 5157, 'Daihatsu', null),
('S710W', 2025, 8204, 10781, 'Daihatsu', null),
('LA850S', 2025, 90660, 130628, 'Daihatsu', null),
('LA850S', 2025, 1043872, 1061681, 'Daihatsu', null),
('LA850S', 2025, 2000056, 2046346, 'Daihatsu', null),
('LA860S', 2025, 17583, 24741, 'Daihatsu', null),
('LA860S', 2025, 1009078, 1012699, 'Daihatsu', null),
('LA860S', 2025, 2000055, 2011145, 'Daihatsu', null),
('LA850F', 2025, 2000054, 2002575, 'Daihatsu', null),
('LA860F', 2025, 2000053, 2001270, 'Daihatsu', null);

-- ============ Views ============

create view vehicle_pnl as
select
  v.chassis_number,
  vm.make,
  vm.name as model,
  v.year,
  v.vehicle_status,
  v.supplier_id,
  v.target_listing_price,
  v.landed_date,
  case when v.landed_date is not null then (current_date - v.landed_date) else null end as days_since_landed,
  coalesce(exp.total_landed_cost, 0) as total_landed_cost,
  s.id as sale_id,
  s.agreed_sale_price,
  coalesce(rec.total_cash_collected, 0) as total_cash_collected,
  case when s.id is not null then s.agreed_sale_price - coalesce(rec.total_cash_collected, 0) else null end as balance_due,
  case when s.id is not null then s.agreed_sale_price - coalesce(exp.total_landed_cost, 0) else null end as net_profit,
  case
    when s.id is not null and coalesce(exp.total_landed_cost, 0) > 0
      then round((s.agreed_sale_price - coalesce(exp.total_landed_cost, 0)) / exp.total_landed_cost * 100, 2)
    else null
  end as profit_margin_percent,
  case when s.id is null then v.target_listing_price - coalesce(exp.total_landed_cost, 0) else null end as projected_profit
from vehicles v
join vehicle_models vm on vm.id = v.model_id
left join (
  select ve.chassis_number, sum(ct.amount_lkr) as total_landed_cost
  from vehicle_expenses ve
  join cash_transfers ct on ct.id = ve.cash_transfer_id
  group by ve.chassis_number
) exp on exp.chassis_number = v.chassis_number
left join sales s on s.chassis_number = v.chassis_number
left join (
  select sale_id, sum(amount) as total_cash_collected
  from sale_receipts
  group by sale_id
) rec on rec.sale_id = s.id;

-- "Native" balances are meant to be read in the entity's own primary_currency. When that
-- currency is LKR, it IS the system's base currency, so every transfer already has an
-- LKR-equivalent (amount_lkr) regardless of what currency it was actually entered in —
-- native should equal the LKR total in that case, not just the subset literally entered
-- as "LKR". For a non-LKR entity (e.g. a JPY supplier) there's no such universal
-- conversion available, so native there stays limited to transfers actually recorded in
-- that exact currency.
create view cash_entity_balance as
select
  ce.id as entity_id,
  ce.name,
  ce.type,
  ce.category,
  ce.logo_path,
  ce.primary_currency,
  ce.supplier_id,
  coalesce(in_lkr.total, 0) as total_in_lkr,
  coalesce(out_lkr.total, 0) as total_out_lkr,
  coalesce(in_lkr.total, 0) - coalesce(out_lkr.total, 0) as balance_lkr,
  case when ce.primary_currency = 'LKR' then coalesce(in_lkr.total, 0) else coalesce(in_native.total, 0) end
    as total_in_native,
  case when ce.primary_currency = 'LKR' then coalesce(out_lkr.total, 0) else coalesce(out_native.total, 0) end
    as total_out_native,
  case
    when ce.primary_currency = 'LKR' then coalesce(in_lkr.total, 0) - coalesce(out_lkr.total, 0)
    else coalesce(in_native.total, 0) - coalesce(out_native.total, 0)
  end as balance_native
from cash_entities ce
left join (
  select destination_entity_id, sum(amount_lkr) as total
  from cash_transfers
  group by destination_entity_id
) in_lkr on in_lkr.destination_entity_id = ce.id
left join (
  select source_entity_id, sum(amount_lkr) as total
  from cash_transfers
  group by source_entity_id
) out_lkr on out_lkr.source_entity_id = ce.id
left join (
  select ct.destination_entity_id, sum(ct.amount) as total
  from cash_transfers ct
  join cash_entities e on e.id = ct.destination_entity_id
  where ct.currency = e.primary_currency
  group by ct.destination_entity_id
) in_native on in_native.destination_entity_id = ce.id
left join (
  select ct.source_entity_id, sum(ct.amount) as total
  from cash_transfers ct
  join cash_entities e on e.id = ct.source_entity_id
  where ct.currency = e.primary_currency
  group by ct.source_entity_id
) out_native on out_native.source_entity_id = ce.id;

create view executive_summary as
select
  (select coalesce(sum(ct.amount_lkr), 0)
     from vehicle_expenses ve join cash_transfers ct on ct.id = ve.cash_transfer_id) as total_capital_invested,
  (select coalesce(sum(amount), 0) from sale_receipts) as total_cash_received,
  (select coalesce(sum(net_profit), 0) from vehicle_pnl where vehicle_status = 'SOLD_FULLY_CLOSED') as total_realized_profit,
  (select coalesce(sum(balance_due), 0) from vehicle_pnl where balance_due is not null) as outstanding_receivables,
  (select coalesce(sum(ct.amount_lkr), 0)
     from cash_transfers ct join cash_entities e on e.id = ct.source_entity_id
     where e.type = 'INVESTOR') as total_capital_injected,
  (select coalesce(sum(ct.amount_lkr), 0)
     from overhead_expenses oe join cash_transfers ct on ct.id = oe.cash_transfer_id) as total_overhead_expenses;

create view model_summary as
select
  vm.id as model_id,
  vm.name as model,
  count(v.chassis_number) as total_vehicles,
  count(*) filter (where v.vehicle_status in ('BOUGHT_NOT_RECEIVED', 'IN_STOCK')) as available_count,
  count(*) filter (where v.vehicle_status = 'SOLD_PENDING_PAYMENT') as pending_payment_count,
  count(*) filter (where v.vehicle_status = 'SOLD_FULLY_CLOSED') as sold_count,
  coalesce(sum(pnl.total_landed_cost), 0) as total_landed_cost,
  coalesce(sum(pnl.net_profit) filter (where v.vehicle_status = 'SOLD_FULLY_CLOSED'), 0) as total_realized_profit
from vehicle_models vm
join vehicles v on v.model_id = vm.id
left join vehicle_pnl pnl on pnl.chassis_number = v.chassis_number
group by vm.id, vm.name
order by count(v.chassis_number) desc;

-- ============ Status-transition triggers ============

create or replace function sync_vehicle_status_on_sale_insert()
returns trigger as $$
begin
  update vehicles
  set vehicle_status = 'SOLD_PENDING_PAYMENT'
  where chassis_number = new.chassis_number
    and vehicle_status = 'IN_STOCK';
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_sale_created on sales;
create trigger on_sale_created
  after insert on sales
  for each row execute procedure sync_vehicle_status_on_sale_insert();

create or replace function sync_vehicle_status_on_sale_delete()
returns trigger as $$
begin
  update vehicles
  set vehicle_status = 'IN_STOCK'
  where chassis_number = old.chassis_number
    and vehicle_status in ('SOLD_PENDING_PAYMENT', 'SOLD_FULLY_CLOSED');
  return old;
end;
$$ language plpgsql;

drop trigger if exists on_sale_deleted on sales;
create trigger on_sale_deleted
  after delete on sales
  for each row execute procedure sync_vehicle_status_on_sale_delete();

create or replace function sync_vehicle_status_on_receipt_change()
returns trigger as $$
declare
  affected_sale_id uuid;
  target_chassis text;
  target_price numeric(15, 2);
  collected numeric(15, 2);
begin
  affected_sale_id := coalesce(new.sale_id, old.sale_id);

  select chassis_number, agreed_sale_price into target_chassis, target_price
  from sales where id = affected_sale_id;

  -- The parent sale may already be gone (e.g. this fired via cascade from a sale delete);
  -- sync_vehicle_status_on_sale_delete handles the vehicle status in that case.
  if target_chassis is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into collected
  from sale_receipts where sale_id = affected_sale_id;

  if collected >= target_price then
    update vehicles
    set vehicle_status = 'SOLD_FULLY_CLOSED'
    where chassis_number = target_chassis
      and vehicle_status = 'SOLD_PENDING_PAYMENT';
  else
    update vehicles
    set vehicle_status = 'SOLD_PENDING_PAYMENT'
    where chassis_number = target_chassis
      and vehicle_status = 'SOLD_FULLY_CLOSED';
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists on_receipt_change on sale_receipts;
create trigger on_receipt_change
  after insert or update or delete on sale_receipts
  for each row execute procedure sync_vehicle_status_on_receipt_change();

-- ============ Storage buckets ============
-- Photos/logos are public (stable URLs, low sensitivity). Receipts/documents are private
-- (signed URLs), since they can show bank references/amounts. Upsert-style so reruns
-- don't wipe existing files.
insert into storage.buckets (id, name, public)
values
  ('vehicle-photos', 'vehicle-photos', true),
  ('supplier-logos', 'supplier-logos', true),
  ('resource-logos', 'resource-logos', true),
  ('cash-entity-logos', 'cash-entity-logos', true),
  ('app-branding', 'app-branding', true),
  ('receipt-attachments', 'receipt-attachments', false),
  ('vehicle-documents', 'vehicle-documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "authenticated manage app files" on storage.objects;
drop policy if exists "authenticated view app files" on storage.objects;
drop policy if exists "staff upload app files" on storage.objects;
drop policy if exists "staff replace app files" on storage.objects;
drop policy if exists "admin delete app files" on storage.objects;

create policy "authenticated view app files" on storage.objects
  for select
  using (
    bucket_id in (
      'vehicle-photos', 'supplier-logos', 'resource-logos', 'cash-entity-logos',
      'app-branding', 'receipt-attachments', 'vehicle-documents'
    )
    and auth.role() = 'authenticated'
  );

create policy "staff upload app files" on storage.objects
  for insert
  with check (
    bucket_id in (
      'vehicle-photos', 'supplier-logos', 'resource-logos', 'cash-entity-logos',
      'app-branding', 'receipt-attachments', 'vehicle-documents'
    )
    and public.current_user_role() in ('ADMIN', 'STAFF')
  );

create policy "staff replace app files" on storage.objects
  for update
  using (
    bucket_id in (
      'vehicle-photos', 'supplier-logos', 'resource-logos', 'cash-entity-logos',
      'app-branding', 'receipt-attachments', 'vehicle-documents'
    )
    and public.current_user_role() in ('ADMIN', 'STAFF')
  );

create policy "admin delete app files" on storage.objects
  for delete
  using (
    bucket_id in (
      'vehicle-photos', 'supplier-logos', 'resource-logos', 'cash-entity-logos',
      'app-branding', 'receipt-attachments', 'vehicle-documents'
    )
    and public.current_user_role() = 'ADMIN'
  );

-- ============ Row Level Security ============
-- Role-based model: Admin (everything), Staff (day-to-day operations, no deletes, no
-- Settings), Viewer (read-only). See public.current_user_role().
alter table profiles enable row level security;
alter table app_settings enable row level security;
alter table suppliers enable row level security;
alter table supplier_balance_holds enable row level security;
alter table cash_entities enable row level security;
alter table cash_transfers enable row level security;
alter table cost_heads enable row level security;
alter table vehicle_models enable row level security;
alter table vehicles enable row level security;
alter table vehicle_photos enable row level security;
alter table vehicle_documents enable row level security;
alter table vehicle_expenses enable row level security;
alter table overhead_categories enable row level security;
alter table overhead_expenses enable row level security;
alter table resources enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_receipts enable row level security;
alter table invoices enable row level security;
alter table chassis_year_ranges enable row level security;

-- `profiles` is never dropped above, so its policies must be dropped explicitly to make this script rerunnable.
drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "authenticated update own profile" on profiles;
drop policy if exists "admin update any profile" on profiles;
create policy "authenticated read profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "authenticated update own profile" on profiles for update using (auth.uid() = id);
create policy "admin update any profile" on profiles for update using (public.current_user_role() = 'ADMIN');

-- Group A — reference/config tables: everyone can read, only Admin can write.
-- (app_settings, vehicle_models, cost_heads, overhead_categories, resources, cash_entities)
create policy "read app_settings" on app_settings for select using (auth.role() = 'authenticated');
create policy "admin write app_settings" on app_settings for insert with check (public.current_user_role() = 'ADMIN');
create policy "admin update app_settings" on app_settings for update using (public.current_user_role() = 'ADMIN');
create policy "admin delete app_settings" on app_settings for delete using (public.current_user_role() = 'ADMIN');

create policy "read vehicle_models" on vehicle_models for select using (auth.role() = 'authenticated');
create policy "admin write vehicle_models" on vehicle_models for insert with check (public.current_user_role() = 'ADMIN');
create policy "admin update vehicle_models" on vehicle_models for update using (public.current_user_role() = 'ADMIN');
create policy "admin delete vehicle_models" on vehicle_models for delete using (public.current_user_role() = 'ADMIN');

create policy "read cost_heads" on cost_heads for select using (auth.role() = 'authenticated');
create policy "admin write cost_heads" on cost_heads for insert with check (public.current_user_role() = 'ADMIN');
create policy "admin update cost_heads" on cost_heads for update using (public.current_user_role() = 'ADMIN');
create policy "admin delete cost_heads" on cost_heads for delete using (public.current_user_role() = 'ADMIN');

create policy "read overhead_categories" on overhead_categories for select using (auth.role() = 'authenticated');
create policy "admin write overhead_categories" on overhead_categories for insert with check (public.current_user_role() = 'ADMIN');
create policy "admin update overhead_categories" on overhead_categories for update using (public.current_user_role() = 'ADMIN');
create policy "admin delete overhead_categories" on overhead_categories for delete using (public.current_user_role() = 'ADMIN');

create policy "read resources" on resources for select using (auth.role() = 'authenticated');
create policy "admin write resources" on resources for insert with check (public.current_user_role() = 'ADMIN');
create policy "admin update resources" on resources for update using (public.current_user_role() = 'ADMIN');
create policy "admin delete resources" on resources for delete using (public.current_user_role() = 'ADMIN');

create policy "read cash_entities" on cash_entities for select using (auth.role() = 'authenticated');
create policy "admin write cash_entities" on cash_entities for insert with check (public.current_user_role() = 'ADMIN');
create policy "admin update cash_entities" on cash_entities for update using (public.current_user_role() = 'ADMIN');
create policy "admin delete cash_entities" on cash_entities for delete using (public.current_user_role() = 'ADMIN');

-- Group B — operational tables: everyone can read, Admin+Staff can insert/update, only Admin can delete.
-- (suppliers, supplier_balance_holds, vehicles, vehicle_photos, vehicle_documents, vehicle_expenses,
--  cash_transfers, overhead_expenses, customers, sales, sale_receipts, invoices)
create policy "read suppliers" on suppliers for select using (auth.role() = 'authenticated');
create policy "staff write suppliers" on suppliers for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update suppliers" on suppliers for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete suppliers" on suppliers for delete using (public.current_user_role() = 'ADMIN');

create policy "read supplier_balance_holds" on supplier_balance_holds for select using (auth.role() = 'authenticated');
create policy "staff write supplier_balance_holds" on supplier_balance_holds for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update supplier_balance_holds" on supplier_balance_holds for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete supplier_balance_holds" on supplier_balance_holds for delete using (public.current_user_role() = 'ADMIN');

create policy "read vehicles" on vehicles for select using (auth.role() = 'authenticated');
create policy "staff write vehicles" on vehicles for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update vehicles" on vehicles for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete vehicles" on vehicles for delete using (public.current_user_role() = 'ADMIN');

create policy "read vehicle_photos" on vehicle_photos for select using (auth.role() = 'authenticated');
create policy "staff write vehicle_photos" on vehicle_photos for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update vehicle_photos" on vehicle_photos for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete vehicle_photos" on vehicle_photos for delete using (public.current_user_role() = 'ADMIN');

create policy "read vehicle_documents" on vehicle_documents for select using (auth.role() = 'authenticated');
create policy "staff write vehicle_documents" on vehicle_documents for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update vehicle_documents" on vehicle_documents for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete vehicle_documents" on vehicle_documents for delete using (public.current_user_role() = 'ADMIN');

create policy "read vehicle_expenses" on vehicle_expenses for select using (auth.role() = 'authenticated');
create policy "staff write vehicle_expenses" on vehicle_expenses for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update vehicle_expenses" on vehicle_expenses for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete vehicle_expenses" on vehicle_expenses for delete using (public.current_user_role() = 'ADMIN');

create policy "read cash_transfers" on cash_transfers for select using (auth.role() = 'authenticated');
create policy "staff write cash_transfers" on cash_transfers for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update cash_transfers" on cash_transfers for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete cash_transfers" on cash_transfers for delete using (public.current_user_role() = 'ADMIN');

create policy "read overhead_expenses" on overhead_expenses for select using (auth.role() = 'authenticated');
create policy "staff write overhead_expenses" on overhead_expenses for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update overhead_expenses" on overhead_expenses for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete overhead_expenses" on overhead_expenses for delete using (public.current_user_role() = 'ADMIN');

create policy "read customers" on customers for select using (auth.role() = 'authenticated');
create policy "staff write customers" on customers for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update customers" on customers for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete customers" on customers for delete using (public.current_user_role() = 'ADMIN');

create policy "read sales" on sales for select using (auth.role() = 'authenticated');
create policy "staff write sales" on sales for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update sales" on sales for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete sales" on sales for delete using (public.current_user_role() = 'ADMIN');

create policy "read sale_receipts" on sale_receipts for select using (auth.role() = 'authenticated');
create policy "staff write sale_receipts" on sale_receipts for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update sale_receipts" on sale_receipts for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete sale_receipts" on sale_receipts for delete using (public.current_user_role() = 'ADMIN');

create policy "read invoices" on invoices for select using (auth.role() = 'authenticated');
create policy "staff write invoices" on invoices for insert with check (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "staff update invoices" on invoices for update using (public.current_user_role() in ('ADMIN', 'STAFF'));
create policy "admin delete invoices" on invoices for delete using (public.current_user_role() = 'ADMIN');

-- Group A treatment: regulatory reference data seeded from official PDFs, not user-managed.
create policy "read chassis_year_ranges" on chassis_year_ranges for select using (auth.role() = 'authenticated');
create policy "admin write chassis_year_ranges" on chassis_year_ranges for insert with check (public.current_user_role() = 'ADMIN');
create policy "admin update chassis_year_ranges" on chassis_year_ranges for update using (public.current_user_role() = 'ADMIN');
create policy "admin delete chassis_year_ranges" on chassis_year_ranges for delete using (public.current_user_role() = 'ADMIN');
