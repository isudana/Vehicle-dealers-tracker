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

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

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

insert into cash_entities (name, type, category) values
  ('HIPG', 'PORT', 'CASH_ENTITY'),
  ('Sri Lanka Customs', 'GOVERNMENT', 'CASH_ENTITY'),
  ('Colombo Port', 'PORT', 'CASH_ENTITY'),
  ('RMV', 'GOVERNMENT', 'CASH_ENTITY'),
  ('Petty Cash', 'CASH', 'CASH_ACCOUNT'),
  -- Aggregate source for Advance/Direct Cash sale receipts, so depositing one into a real
  -- Cash Account is a real transfer (source=Customer Payments) rather than an untracked
  -- number — its own balance shows cumulative money received from customers, mirroring
  -- how a Leasing Company's balance reflects cumulative disbursements.
  ('Customer Payments', 'CUSTOMER', 'CASH_ACCOUNT');

create or replace function sync_cash_entity_from_supplier()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into cash_entities (name, type, category, logo_path, primary_currency, supplier_id) values
      (new.name, 'SUPPLIER', 'CASH_ACCOUNT', new.logo_path, new.primary_currency, new.id),
      (new.name, 'SUPPLIER', 'CASH_ENTITY', new.logo_path, new.primary_currency, new.id);
  else
    update cash_entities
    set name = new.name, logo_path = new.logo_path, primary_currency = new.primary_currency
    where supplier_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

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
create policy "authenticated manage app files" on storage.objects
  for all
  using (
    bucket_id in (
      'vehicle-photos', 'supplier-logos', 'resource-logos', 'cash-entity-logos',
      'app-branding', 'receipt-attachments', 'vehicle-documents'
    )
    and auth.role() = 'authenticated'
  )
  with check (
    bucket_id in (
      'vehicle-photos', 'supplier-logos', 'resource-logos', 'cash-entity-logos',
      'app-branding', 'receipt-attachments', 'vehicle-documents'
    )
    and auth.role() = 'authenticated'
  );

-- ============ Row Level Security ============
-- Small trusted-team model: any authenticated user can read/write everything.
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

-- `profiles` is never dropped above, so its policies must be dropped explicitly to make this script rerunnable.
drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "authenticated update own profile" on profiles;
create policy "authenticated read profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "authenticated update own profile" on profiles for update using (auth.uid() = id);

create policy "authenticated full access app_settings" on app_settings for all using (auth.role() = 'authenticated');
create policy "authenticated full access suppliers" on suppliers for all using (auth.role() = 'authenticated');
create policy "authenticated full access supplier_balance_holds" on supplier_balance_holds for all using (auth.role() = 'authenticated');
create policy "authenticated full access cash_entities" on cash_entities for all using (auth.role() = 'authenticated');
create policy "authenticated full access cash_transfers" on cash_transfers for all using (auth.role() = 'authenticated');
create policy "authenticated full access cost_heads" on cost_heads for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_models" on vehicle_models for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicles" on vehicles for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_photos" on vehicle_photos for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_documents" on vehicle_documents for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_expenses" on vehicle_expenses for all using (auth.role() = 'authenticated');
create policy "authenticated full access overhead_categories" on overhead_categories for all using (auth.role() = 'authenticated');
create policy "authenticated full access overhead_expenses" on overhead_expenses for all using (auth.role() = 'authenticated');
create policy "authenticated full access resources" on resources for all using (auth.role() = 'authenticated');
create policy "authenticated full access customers" on customers for all using (auth.role() = 'authenticated');
create policy "authenticated full access sales" on sales for all using (auth.role() = 'authenticated');
create policy "authenticated full access sale_receipts" on sale_receipts for all using (auth.role() = 'authenticated');
create policy "authenticated full access invoices" on invoices for all using (auth.role() = 'authenticated');
