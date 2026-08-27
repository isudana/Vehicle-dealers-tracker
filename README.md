# Vehicle Import, Cost Ledger & Sales Management Platform

Tracks the full lifecycle of an imported vehicle — foreign supplier purchase, port clearance, reconditioning costs, stock, and sale (cash / leasing / hybrid financing) — keyed by chassis number. Gives real-time landed cost, profit margin, cash-entity balances, and customer receivables. Built with Next.js and Supabase, deployable to Vercel so it's reachable from anywhere.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a new project (free tier is fine).
2. Open **SQL Editor** in the project dashboard, paste in the full contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. **This drops and recreates every table** (except `profiles`) and creates 7 Storage buckets (vehicle photos, supplier/resource/cash-entity logos, app branding, receipt attachments, vehicle documents) — no manual Storage dashboard setup needed. Re-run it any time you want a clean slate.
3. Go to **Project Settings → API** and copy the **Project URL** and **anon public** key.

## 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with the two values from step 1. It's git-ignored, so they won't be committed.

## 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign up (small trusted-team model — anyone who signs up gets full access).

## 4. Domain model

- **Cash entities** (`/settings`) — every person/organization/pool money moves to or from: banks, petty cash, drivers, mechanics, investors, government bodies (Sri Lanka Customs, RMV), ports (HIPG, Colombo Port), clearing agents, and suppliers. Suppliers get one automatically when added.
- **Cash transfers** (`/cash`) — the single ledger every money movement in the app is built from: a source entity, a destination entity, an amount/currency, a method (TT/LC/Cash/Bank Transfer/Other), and an optional receipt (+ LC document scan for LC transfers). Vehicle expenses and overhead expenses are transfers with a cost classification attached; supplier deposits/refunds and general capital movements (e.g. an Investor funding a Bank account) are transfers on their own.
- **Suppliers** — foreign auction houses / import agents, each with a linked cash entity so their balance is just that entity's balance (no separate bookkeeping).
- **Vehicles** — keyed by **chassis number**. Model is picked from a managed catalog (add new models in Settings — no free-text fallback). Moves through four states: Bought Not Received → In Stock → Sold Pending Payment → Sold Fully Closed (the last two transitions happen automatically as receipts come in). Also tracks Auction (FOB) and CIF reference prices, a photo gallery, and general document attachments (permits, bills of lading, etc.).
- **Cost ledger** — add/remove cost line items (each a transfer with a source/destination) against a vehicle at any time, grouped into Procurement & Bank / Port & Logistics / Transit & Reconditioning / Legal & Misc. The destination auto-suggests for cost heads with an obvious default (LC/TT Amount → the vehicle's own supplier; HIPG/Customs Duty/DO Charges/RMV Penalty → the matching seeded entity).
- **Customers** — buyer profiles (NIC/passport, contact) with purchase history.
- **Sales & receipts** — one sale per vehicle (agreed price, payment type, leasing details), with a running receipts ledger (advance / direct cash / leasing disbursal) — the vehicle auto-closes once receipts cover the agreed price. (Sales stay outside the cash-entity ledger for now — customers aren't modeled as cash entities.)
- **Overhead expenses** (`/overheads`) — costs that don't belong to any one vehicle (showroom maintenance, advertisement, rent, bills, other), also transfers with a source/destination.
- **Resources** (`/resources`) — an editable list of useful external links (auction sites, shipping schedules, bank/customs exchange rate pages).
- **Dashboard** — the 4 SRS executive KPIs (capital invested, cash received, realized profit, outstanding receivables) plus total capital injected (transfers sourced from an Investor entity), total overhead expenses, vehicles grouped by lifecycle state, and a per-model summary table.
- **Settings** (`/settings`) — app name/logo, the vehicle model catalog, cash entities, and where new suppliers and resources are added (their browsing/detail pages stay at `/suppliers` and `/resources`).

### Multi-currency

Every transfer (vehicle/overhead expenses, supplier transfers, general cash movements) can be entered in LKR, JPY, or USD with an exchange rate to LKR. Every system-wide total (landed cost, dashboard KPIs, entity balances) is calculated from the LKR-converted amount, so entry currency never affects a comparison across records. Entity/supplier pages additionally show balances in both the entity's **primary currency** (native totals) and LKR.

### Photos, logos & receipts

Vehicles can have multiple photos and any-file-type documents; suppliers, cash entities, and resources can each have a logo; every transfer can have an optional receipt (image or PDF), with a further LC document field when the method is LC. Photos/logos are stored in public Storage buckets (simple stable URLs); receipts and vehicle documents are private, served via short-lived signed URLs generated per page load.

## 5. Deploy so it's reachable from anywhere

1. Push this project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign up, and "Import Project" from that repo.
3. Add the same two environment variables under **Settings → Environment Variables**.
4. Deploy. Vercel gives you a public HTTPS URL you can open from any device, anywhere.

## Notes

- Access control: any signed-up user can read/write all data (RLS policies in `supabase/schema.sql`). Disable "Allow new users to sign up" in Supabase Auth settings if you need to lock that down.
- Currency: sale prices and receipts are assumed LKR. Every `cash_transfers` row carries its own `currency` + `exchange_rate_to_lkr` (manually entered — check the Resources page for BOC/Customs rate lookups) and a generated `amount_lkr` column that all totals sum from.
- "Sold Fully Closed" is not a hard edit-lock: deleting/editing a receipt after a sale is fully closed will automatically revert the vehicle to "Sold Pending Payment" if the collected total drops below the agreed price.
