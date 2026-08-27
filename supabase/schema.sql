-- Vehicle Import, Cost Ledger & Sales Management Platform schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- WARNING: this drops and recreates every table except `profiles`. Destructive.
-- Also creates 6 Storage buckets (vehicle-photos, supplier-logos, resource-logos,
-- app-branding, receipt-attachments, vehicle-documents) — no manual Storage dashboard setup needed.

-- ============ Cleanup (FK-safe order) ============
drop view if exists model_summary;
drop view if exists executive_summary;
drop view if exists supplier_balance;
drop view if exists vehicle_pnl;
drop view if exists car_profit; -- from the earlier prototype schema

drop table if exists app_settings cascade;
drop table if exists resources cascade;
drop table if exists overhead_expenses cascade;
drop table if exists overhead_categories cascade;
drop table if exists capital_injections cascade;
drop table if exists sale_receipts cascade;
drop table if exists sales cascade;
drop table if exists customers cascade;
drop table if exists supplier_advances cascade;
drop table if exists vehicle_photos cascade;
drop table if exists vehicle_documents cascade;
drop table if exists vehicle_expenses cascade;
drop table if exists vehicles cascade;
drop table if exists vehicle_models cascade;
drop table if exists cost_heads cascade;

-- from the earlier prototype schema (dropped before `suppliers`, which they reference)
drop table if exists supplier_payments cascade;
drop table if exists expenses cascade;
drop table if exists expense_categories cascade;
drop table if exists cars cascade;

drop table if exists suppliers cascade;

drop type if exists receipt_method;
drop type if exists advance_type;
drop type if exists leasing_status_t;
drop type if exists payment_type_t;
drop type if exists vehicle_status_t;

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
create type advance_type as enum ('TT_DEPOSIT', 'LC_TRANSFER', 'REFUND');
create type receipt_method as enum ('ADVANCE', 'DIRECT_CASH', 'LEASING_DISBURSAL');

-- ============ App-wide settings (singleton row) ============
create table app_settings (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'Vehicle Import Tracker',
  logo_path text
);

insert into app_settings (id, app_name) values (1, 'Vehicle Import Tracker');

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
create table vehicle_models (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into vehicle_models (name) values
  ('AQUA HYBRID 1500CC HYBRID X'),
  ('AQUA HYBRID 1500CC HYBRID G'),
  ('AQUA HYBRID 1500CC HYBRID Z'),
  ('AXIO 1500CC HYBRID EX'),
  ('Corolla Cross ZVG11 Hybrid Z 1800 cc'),
  ('Corolla Sports G "Z"'),
  ('HARRIER XU80 PETROL Z LEATHER PACKAGE'),
  ('HARRIER XU80 PETROL G'),
  ('HARRIER XU80 PETROL Z'),
  ('6AA-AXUH85 HARRIER Z LEATHER PACKAGE 4WD'),
  ('6AA-AXUH80 HARRIER Z LEATHER PACKAGE 2WD'),
  ('6LA-AXUP85 HARRIER Z Plug-in Hybrid'),
  ('RAIZE 1000CC PETROL X 4WD'),
  ('RAIZE 1000CC PETROL G 4WD'),
  ('RAIZE 1000CC PETROL Z 4WD'),
  ('RAIZE 1200CC HYBRID G'),
  ('RAIZE 1200CC HYBRID Z'),
  ('RAIZE 1200CC PETROL G'),
  ('RAIZE 1200CC PETROL X'),
  ('RAIZE 1200CC PETROL Z'),
  ('VEZEL 1500CC HYBRID E:HEV X'),
  ('VEZEL 1500CC HYBRID E:HEV X HUNT'),
  ('VEZEL 1500CC HYBRID E:HEV Z'),
  ('VEZEL 1500CC HYBRID E:HEV Z Premium Audio'),
  ('VEZEL 1500CC HYBRID E:HEV Z PLAY'),
  ('VEZEL 1500CC HYBRID E:HEV RS'),
  ('Wagon R HYBRID ZX 2WD CVT'),
  ('Wagon R HYBRID ZX 4WD CVT'),
  ('Wagon R ZL 2WD'),
  ('Wagon R ZL 4WD'),
  ('YARIS CROSS 1500CC HYBRID G'),
  ('YARIS CROSS 1500CC HYBRID X'),
  ('YARIS CROSS 1500CC HYBRID Z'),
  ('YARIS CROSS 1500CC HYBRID Z ADVENTURE'),
  ('YARIS HYBRID 1500CC HYBRID G'),
  ('YARIS HYBRID 1500CC HYBRID X'),
  ('YARIS HYBRID 1500CC HYBRID Z'),
  ('YARIS PETROL 1000CC PETROL G'),
  ('YARIS PETROL 1000CC PETROL X'),
  ('Crown Z (hybrid car)'),
  ('ALTO HYBRID X 2WD/CVT'),
  ('ALTO HYBRID X 4WD/CVT'),
  ('ALTO HYBRID S 2WD/CVT'),
  ('ALTO HYBRID S 4WD/CVT'),
  ('ALTO L 2WD/CVT'),
  ('ALTO L 4WD/CVT'),
  ('ALTO L 2WD/CVT Upgraded'),
  ('ALTO L 4WD/CVT Upgraded'),
  ('ALTO A 2WD/CVT'),
  ('ALTO A 4WD/CVT'),
  ('PIXIS EPOCH B SA III 2WD'),
  ('PIXIS EPOCH L SA III 2WD'),
  ('PIXIS EPOCH X SA III 2WD'),
  ('PIXIS EPOCH G SA III 2WD'),
  ('CLA 180'),
  ('NISSAN AURA G'),
  ('NISSAN AURA G Leather Edition'),
  ('NISSAN AURA G 90 Aniversary'),
  ('NISSAN AURA NISMO'),
  ('NISSAN AURA AUTECH'),
  ('NISSAN AURA AUTECH SPORTS'),
  ('DAIHATSU TAFT X'),
  ('DAIHATSU TAFT X TURBO'),
  ('DAIHATSU TAFT G 2WD'),
  ('DAIHATSU TAFT G "Chrome Venture"'),
  ('DAIHATSU TAFT G "Dark Chrome Venture"'),
  ('DAIHATSU TAFT G TURBO'),
  ('DAIHATSU TAFT G TURBO "Chrome Venture"'),
  ('DAIHATSU TAFT G TURBO "Chrome Venture" 4WD'),
  ('DAIHATSU TAFT G TURBO "Dark Chrome Venture"'),
  ('Audi Q3 Sportback'),
  ('SWIFT HYBRID MZ 2WD/CVT'),
  ('SWIFT HYBRID MZ 4WD/CVT'),
  ('SWIFT HYBRID MX 2WD/5MT'),
  ('SWIFT HYBRID MX 2WD/CVT'),
  ('SWIFT HYBRID MX 4WD/CVT'),
  ('SWIFT XG 2WD/CVT'),
  ('SWIFT XG 4WD/CVT'),
  ('Mira e:s B "SA III" 2WD'),
  ('Mira e:s L "SA III" 2WD'),
  ('Mira e:s X "SA III" 2WD'),
  ('Mira e:s G "SA III" 2WD'),
  ('Roomy Custom G T'),
  ('Roomy Custom G 2WD'),
  ('Roomy G'),
  ('Roomy GT'),
  ('Roomy X'),
  ('Audi A3'),
  ('Suzuki Jimny XG'),
  ('Suzuki Jimny XL'),
  ('Suzuki Jimny XC'),
  ('Nissan Dayz Highway Star X ProPilot Edition'),
  ('Nissan Dayz Highway Star G Turbo'),
  ('EVERY WAGON PZ Turbo Special Standard Roof 2WD'),
  ('EVERY WAGON PZ Turbo Special Standard Roof 4WD'),
  ('EVERY WAGON PZ Turbo Special High Roof 2WD'),
  ('EVERY WAGON PZ Turbo Special High Roof 4WD'),
  ('EVERY WAGON PZ Turbo Standard Roof 2WD'),
  ('EVERY WAGON PZ Turbo Standard Roof 4WD'),
  ('EVERY WAGON PZ Turbo High Roof 2WD'),
  ('EVERY WAGON PZ Turbo High Roof 4WD'),
  ('EVERY JOIN Turbo (High Roof) 2WD'),
  ('EVERY JOIN Turbo (High Roof) 4WD'),
  ('EVERY JOIN (High Roof) 2WD MT'),
  ('EVERY JOIN (High Roof) 4WD MT'),
  ('EVERY JOIN (High Roof) 2WD CVT'),
  ('EVERY JOIN (High Roof) 4WD CVT'),
  ('EVERY PC (High Roof) 2WD 5MT'),
  ('EVERY PC (High Roof) 4WD 5MT'),
  ('EVERY PC (High Roof) 2WD CVT'),
  ('EVERY PC (High Roof) 4WD CVT'),
  ('EVERY PA Limited (High Roof) 2WD 5MT'),
  ('EVERY PA Limited (High Roof) 4WD 5MT'),
  ('EVERY PA Limited (High Roof) 2WD CVT'),
  ('EVERY PA Limited (High Roof) 4WD CVT'),
  ('EVERY PA (High Roof) 2WD 5MT'),
  ('EVERY PA (High Roof) 4WD 5MT'),
  ('EVERY PA (High Roof) 2WD CVT'),
  ('EVERY PA (High Roof) 4WD CVT'),
  ('Land Cruiser Prado 150 Petrol TRJ150 TX L Package 7 Seater'),
  ('Land Cruiser Prado 250 Petrol');

-- ============ Vehicles (chassis number is the primary key) ============
create table vehicles (
  chassis_number text primary key,
  supplier_id uuid not null references suppliers (id),
  make text not null,
  model_id uuid not null references vehicle_models (id),
  year int,
  color text,
  target_listing_price numeric(15, 2) not null default 0,
  auction_price numeric(15, 2),
  cif_price numeric(15, 2),
  purchase_date date,
  expected_clearance_date date,
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

-- ============ Dynamic cost ledger ============
-- Every money-tracking table below shares the same currency convention:
-- `amount` is in `currency`; `exchange_rate_to_lkr` converts 1 unit of that currency to LKR;
-- `amount_lkr` is a generated column so every view/aggregate can sum LKR consistently.
create table vehicle_expenses (
  id uuid primary key default gen_random_uuid(),
  chassis_number text not null references vehicles (chassis_number) on delete cascade,
  cost_head_id uuid not null references cost_heads (id),
  amount numeric(15, 2) not null,
  currency text not null default 'LKR',
  exchange_rate_to_lkr numeric(12, 6) not null default 1,
  amount_lkr numeric(15, 2) generated always as (round(amount * exchange_rate_to_lkr, 2)) stored,
  date_recorded date not null default current_date,
  remarks text,
  attachment_path text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Supplier advance credit ledger ============
create table supplier_advances (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  type advance_type not null,
  amount numeric(15, 2) not null,
  currency text not null default 'JPY',
  exchange_rate_to_lkr numeric(12, 6) not null default 1,
  amount_lkr numeric(15, 2) generated always as (round(amount * exchange_rate_to_lkr, 2)) stored,
  bank_reference text,
  transfer_date date not null default current_date,
  notes text,
  receipt_path text,
  lc_document_path text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Capital injections (funding into the business, not tied to a vehicle) ============
create table capital_injections (
  id uuid primary key default gen_random_uuid(),
  amount numeric(15, 2) not null,
  currency text not null default 'LKR',
  exchange_rate_to_lkr numeric(12, 6) not null default 1,
  amount_lkr numeric(15, 2) generated always as (round(amount * exchange_rate_to_lkr, 2)) stored,
  storage_location text not null,
  source text,
  injection_date date not null default current_date,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Overhead expenses (not tied to a vehicle) ============
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
  amount numeric(15, 2) not null,
  currency text not null default 'LKR',
  exchange_rate_to_lkr numeric(12, 6) not null default 1,
  amount_lkr numeric(15, 2) generated always as (round(amount * exchange_rate_to_lkr, 2)) stored,
  expense_date date not null default current_date,
  remarks text,
  attachment_path text,
  created_by uuid references profiles (id),
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
  leasing_company_name text,
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
  received_date date not null default current_date,
  reference text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Views ============

create view vehicle_pnl as
select
  v.chassis_number,
  v.make,
  vm.name as model,
  v.year,
  v.vehicle_status,
  v.supplier_id,
  v.target_listing_price,
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
  select chassis_number, sum(amount_lkr) as total_landed_cost
  from vehicle_expenses
  group by chassis_number
) exp on exp.chassis_number = v.chassis_number
left join sales s on s.chassis_number = v.chassis_number
left join (
  select sale_id, sum(amount) as total_cash_collected
  from sale_receipts
  group by sale_id
) rec on rec.sale_id = s.id;

create view supplier_balance as
select
  sup.id as supplier_id,
  sup.name,
  sup.primary_currency,
  coalesce(dep_lkr.total, 0) as total_deposits_lkr,
  coalesce(ref_lkr.total, 0) as total_refunds_lkr,
  coalesce(ded_lkr.total, 0) as total_deducted_lkr,
  coalesce(dep_lkr.total, 0) - coalesce(ded_lkr.total, 0) + coalesce(ref_lkr.total, 0) as available_balance_lkr,
  coalesce(dep_native.total, 0) as total_deposits_native,
  coalesce(ref_native.total, 0) as total_refunds_native,
  coalesce(ded_native.total, 0) as total_deducted_native,
  coalesce(dep_native.total, 0) - coalesce(ded_native.total, 0) + coalesce(ref_native.total, 0) as available_balance_native
from suppliers sup
left join (
  select supplier_id, sum(amount_lkr) as total
  from supplier_advances where type in ('TT_DEPOSIT', 'LC_TRANSFER')
  group by supplier_id
) dep_lkr on dep_lkr.supplier_id = sup.id
left join (
  select supplier_id, sum(amount_lkr) as total
  from supplier_advances where type = 'REFUND'
  group by supplier_id
) ref_lkr on ref_lkr.supplier_id = sup.id
left join (
  select v.supplier_id, sum(e.amount_lkr) as total
  from vehicle_expenses e
  join vehicles v on v.chassis_number = e.chassis_number
  join cost_heads ch on ch.id = e.cost_head_id
  where ch.name in ('LC Amount', 'TT Amount')
  group by v.supplier_id
) ded_lkr on ded_lkr.supplier_id = sup.id
left join (
  select sa.supplier_id, sum(sa.amount) as total
  from supplier_advances sa
  join suppliers s on s.id = sa.supplier_id
  where sa.type in ('TT_DEPOSIT', 'LC_TRANSFER') and sa.currency = s.primary_currency
  group by sa.supplier_id
) dep_native on dep_native.supplier_id = sup.id
left join (
  select sa.supplier_id, sum(sa.amount) as total
  from supplier_advances sa
  join suppliers s on s.id = sa.supplier_id
  where sa.type = 'REFUND' and sa.currency = s.primary_currency
  group by sa.supplier_id
) ref_native on ref_native.supplier_id = sup.id
left join (
  select v.supplier_id, sum(e.amount) as total
  from vehicle_expenses e
  join vehicles v on v.chassis_number = e.chassis_number
  join cost_heads ch on ch.id = e.cost_head_id
  join suppliers s on s.id = v.supplier_id
  where ch.name in ('LC Amount', 'TT Amount') and e.currency = s.primary_currency
  group by v.supplier_id
) ded_native on ded_native.supplier_id = sup.id;

create view executive_summary as
select
  (select coalesce(sum(amount_lkr), 0) from vehicle_expenses) as total_capital_invested,
  (select coalesce(sum(amount), 0) from sale_receipts) as total_cash_received,
  (select coalesce(sum(net_profit), 0) from vehicle_pnl where vehicle_status = 'SOLD_FULLY_CLOSED') as total_realized_profit,
  (select coalesce(sum(balance_due), 0) from vehicle_pnl where balance_due is not null) as outstanding_receivables,
  (select coalesce(sum(amount_lkr), 0) from capital_injections) as total_capital_injected,
  (select coalesce(sum(amount_lkr), 0) from overhead_expenses) as total_overhead_expenses;

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
-- Photos/logos are public (stable URLs, low sensitivity). Receipts are private (signed URLs),
-- since they can show bank references/amounts. Upsert-style so reruns don't wipe existing files.
insert into storage.buckets (id, name, public)
values
  ('vehicle-photos', 'vehicle-photos', true),
  ('supplier-logos', 'supplier-logos', true),
  ('resource-logos', 'resource-logos', true),
  ('app-branding', 'app-branding', true),
  ('receipt-attachments', 'receipt-attachments', false),
  ('vehicle-documents', 'vehicle-documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "authenticated manage app files" on storage.objects;
create policy "authenticated manage app files" on storage.objects
  for all
  using (
    bucket_id in ('vehicle-photos', 'supplier-logos', 'resource-logos', 'app-branding', 'receipt-attachments', 'vehicle-documents')
    and auth.role() = 'authenticated'
  )
  with check (
    bucket_id in ('vehicle-photos', 'supplier-logos', 'resource-logos', 'app-branding', 'receipt-attachments', 'vehicle-documents')
    and auth.role() = 'authenticated'
  );

-- ============ Row Level Security ============
-- Small trusted-team model: any authenticated user can read/write everything.
alter table profiles enable row level security;
alter table app_settings enable row level security;
alter table suppliers enable row level security;
alter table cost_heads enable row level security;
alter table vehicle_models enable row level security;
alter table vehicles enable row level security;
alter table vehicle_photos enable row level security;
alter table vehicle_documents enable row level security;
alter table vehicle_expenses enable row level security;
alter table supplier_advances enable row level security;
alter table capital_injections enable row level security;
alter table overhead_categories enable row level security;
alter table overhead_expenses enable row level security;
alter table resources enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_receipts enable row level security;

-- `profiles` is never dropped above, so its policies must be dropped explicitly to make this script rerunnable.
drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "authenticated update own profile" on profiles;
create policy "authenticated read profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "authenticated update own profile" on profiles for update using (auth.uid() = id);

create policy "authenticated full access app_settings" on app_settings for all using (auth.role() = 'authenticated');
create policy "authenticated full access suppliers" on suppliers for all using (auth.role() = 'authenticated');
create policy "authenticated full access cost_heads" on cost_heads for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_models" on vehicle_models for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicles" on vehicles for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_photos" on vehicle_photos for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_documents" on vehicle_documents for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_expenses" on vehicle_expenses for all using (auth.role() = 'authenticated');
create policy "authenticated full access supplier_advances" on supplier_advances for all using (auth.role() = 'authenticated');
create policy "authenticated full access capital_injections" on capital_injections for all using (auth.role() = 'authenticated');
create policy "authenticated full access overhead_categories" on overhead_categories for all using (auth.role() = 'authenticated');
create policy "authenticated full access overhead_expenses" on overhead_expenses for all using (auth.role() = 'authenticated');
create policy "authenticated full access resources" on resources for all using (auth.role() = 'authenticated');
create policy "authenticated full access customers" on customers for all using (auth.role() = 'authenticated');
create policy "authenticated full access sales" on sales for all using (auth.role() = 'authenticated');
create policy "authenticated full access sale_receipts" on sale_receipts for all using (auth.role() = 'authenticated');
