-- Car Sales & Expense Tracker schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query) once your project is created.

-- Profiles: one row per authenticated user, auto-created on signup.
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

-- Suppliers
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_info text,
  notes text,
  created_at timestamptz not null default now()
);

-- Expense categories (lookup table, seeded below)
create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into expense_categories (name)
values ('Purchase'), ('Shipping'), ('Customs'), ('Repairs'), ('Detailing'), ('Registration'), ('Other')
on conflict (name) do nothing;

-- Cars
create table if not exists cars (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  year int,
  chassis_no text,
  purchase_date date,
  purchase_price numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'in_stock' check (status in ('in_stock', 'sold')),
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- Expenses (many per car)
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars (id) on delete cascade,
  category_id uuid references expense_categories (id),
  supplier_id uuid references suppliers (id),
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  expense_date date not null default current_date,
  description text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- Supplier payments (money sent to a supplier, optionally tied to a car)
create table if not exists supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  car_id uuid references cars (id),
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  payment_date date not null default current_date,
  method text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- Sales (one per car)
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null unique references cars (id) on delete cascade,
  sale_date date not null default current_date,
  sale_price numeric(12, 2) not null,
  currency text not null default 'USD',
  buyer_name text,
  buyer_contact text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- Profit-per-car view: sale price minus purchase price minus all linked expenses.
create or replace view car_profit as
select
  c.id as car_id,
  c.make,
  c.model,
  c.year,
  c.status,
  c.purchase_price,
  coalesce(e.total_expenses, 0) as total_expenses,
  s.sale_price,
  case
    when s.sale_price is not null
      then s.sale_price - c.purchase_price - coalesce(e.total_expenses, 0)
    else null
  end as profit
from cars c
left join (
  select car_id, sum(amount) as total_expenses
  from expenses
  group by car_id
) e on e.car_id = c.id
left join sales s on s.car_id = c.id;

-- Row Level Security: any authenticated user (the small internal team) can read/write everything.
-- No anonymous access.
alter table profiles enable row level security;
alter table suppliers enable row level security;
alter table expense_categories enable row level security;
alter table cars enable row level security;
alter table expenses enable row level security;
alter table supplier_payments enable row level security;
alter table sales enable row level security;

create policy "authenticated read profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "authenticated update own profile" on profiles for update using (auth.uid() = id);

create policy "authenticated full access suppliers" on suppliers for all using (auth.role() = 'authenticated');
create policy "authenticated full access expense_categories" on expense_categories for all using (auth.role() = 'authenticated');
create policy "authenticated full access cars" on cars for all using (auth.role() = 'authenticated');
create policy "authenticated full access expenses" on expenses for all using (auth.role() = 'authenticated');
create policy "authenticated full access supplier_payments" on supplier_payments for all using (auth.role() = 'authenticated');
create policy "authenticated full access sales" on sales for all using (auth.role() = 'authenticated');
