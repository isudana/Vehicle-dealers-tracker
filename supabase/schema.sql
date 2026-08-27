-- Vehicle Import, Cost Ledger & Sales Management Platform schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- WARNING: this drops and recreates every table except `profiles`. Destructive.

-- ============ Cleanup (FK-safe order) ============
drop view if exists executive_summary;
drop view if exists supplier_balance;
drop view if exists vehicle_pnl;
drop view if exists car_profit; -- from the earlier prototype schema

drop table if exists sale_receipts cascade;
drop table if exists sales cascade;
drop table if exists customers cascade;
drop table if exists supplier_advances cascade;
drop table if exists vehicle_expenses cascade;
drop table if exists vehicles cascade;
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
create type advance_type as enum ('DEPOSIT', 'REFUND');
create type receipt_method as enum ('ADVANCE', 'DIRECT_CASH', 'LEASING_DISBURSAL');

-- ============ Suppliers ============
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'Japan',
  contact_person text,
  phone text,
  email text,
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

-- ============ Vehicles (chassis number is the primary key) ============
create table vehicles (
  chassis_number text primary key,
  supplier_id uuid not null references suppliers (id),
  make text not null,
  model text not null,
  year int,
  color text,
  target_listing_price numeric(15, 2) not null default 0,
  purchase_date date,
  expected_clearance_date date,
  vehicle_status vehicle_status_t not null default 'BOUGHT_NOT_RECEIVED',
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ============ Dynamic cost ledger ============
create table vehicle_expenses (
  id uuid primary key default gen_random_uuid(),
  chassis_number text not null references vehicles (chassis_number) on delete cascade,
  cost_head_id uuid not null references cost_heads (id),
  amount numeric(15, 2) not null,
  date_recorded date not null default current_date,
  remarks text,
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
  bank_reference text,
  exchange_rate numeric(12, 4),
  transfer_date date not null default current_date,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

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
  v.model,
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
left join (
  select chassis_number, sum(amount) as total_landed_cost
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
  coalesce(dep.total_deposits, 0) as total_deposits,
  coalesce(ref.total_refunds, 0) as total_refunds,
  coalesce(ded.total_deducted, 0) as total_deducted,
  coalesce(dep.total_deposits, 0) - coalesce(ded.total_deducted, 0) + coalesce(ref.total_refunds, 0) as available_balance
from suppliers sup
left join (
  select supplier_id, sum(amount) as total_deposits
  from supplier_advances where type = 'DEPOSIT'
  group by supplier_id
) dep on dep.supplier_id = sup.id
left join (
  select supplier_id, sum(amount) as total_refunds
  from supplier_advances where type = 'REFUND'
  group by supplier_id
) ref on ref.supplier_id = sup.id
left join (
  select v.supplier_id, sum(e.amount) as total_deducted
  from vehicle_expenses e
  join vehicles v on v.chassis_number = e.chassis_number
  join cost_heads ch on ch.id = e.cost_head_id
  where ch.name in ('LC Amount', 'TT Amount')
  group by v.supplier_id
) ded on ded.supplier_id = sup.id;

create view executive_summary as
select
  (select coalesce(sum(amount), 0) from vehicle_expenses) as total_capital_invested,
  (select coalesce(sum(amount), 0) from sale_receipts) as total_cash_received,
  (select coalesce(sum(net_profit), 0) from vehicle_pnl where vehicle_status = 'SOLD_FULLY_CLOSED') as total_realized_profit,
  (select coalesce(sum(balance_due), 0) from vehicle_pnl where balance_due is not null) as outstanding_receivables;

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

-- ============ Row Level Security ============
-- Small trusted-team model: any authenticated user can read/write everything.
alter table profiles enable row level security;
alter table suppliers enable row level security;
alter table cost_heads enable row level security;
alter table vehicles enable row level security;
alter table vehicle_expenses enable row level security;
alter table supplier_advances enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_receipts enable row level security;

-- `profiles` is never dropped above, so its policies must be dropped explicitly to make this script rerunnable.
drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "authenticated update own profile" on profiles;
create policy "authenticated read profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "authenticated update own profile" on profiles for update using (auth.uid() = id);

create policy "authenticated full access suppliers" on suppliers for all using (auth.role() = 'authenticated');
create policy "authenticated full access cost_heads" on cost_heads for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicles" on vehicles for all using (auth.role() = 'authenticated');
create policy "authenticated full access vehicle_expenses" on vehicle_expenses for all using (auth.role() = 'authenticated');
create policy "authenticated full access supplier_advances" on supplier_advances for all using (auth.role() = 'authenticated');
create policy "authenticated full access customers" on customers for all using (auth.role() = 'authenticated');
create policy "authenticated full access sales" on sales for all using (auth.role() = 'authenticated');
create policy "authenticated full access sale_receipts" on sale_receipts for all using (auth.role() = 'authenticated');
