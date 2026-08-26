# Vehicle Import, Cost Ledger & Sales Management Platform

Tracks the full lifecycle of an imported vehicle — foreign supplier purchase, port clearance, reconditioning costs, stock, and sale (cash / leasing / hybrid financing) — keyed by chassis number. Gives real-time landed cost, profit margin, supplier credit balances, and customer receivables. Built with Next.js and Supabase, deployable to Vercel so it's reachable from anywhere.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a new project (free tier is fine).
2. Open **SQL Editor** in the project dashboard, paste in the full contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. **This drops and recreates every table** (except `profiles`) — re-run it any time you want a clean slate.
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

- **Suppliers** — foreign auction houses / import agents. Track advance TT/LC deposits and refunds; each vehicle's LC/TT cost entries automatically count against that supplier's available balance.
- **Vehicles** — keyed by **chassis number**. Moves through four states: Bought Not Received → In Stock → Sold Pending Payment → Sold Fully Closed (the last two transitions happen automatically as receipts come in).
- **Cost ledger** — add/remove cost line items against a vehicle at any time, grouped into Procurement & Bank / Port & Logistics / Transit & Reconditioning / Legal & Misc.
- **Customers** — buyer profiles (NIC/passport, contact) with purchase history.
- **Sales & receipts** — one sale per vehicle (agreed price, payment type, leasing details), with a running receipts ledger (advance / direct cash / leasing disbursal) — the vehicle auto-closes once receipts cover the agreed price.
- **Dashboard** — the 4 executive KPIs (capital invested, cash received, realized profit, outstanding receivables) plus vehicles grouped by lifecycle state.

## 5. Deploy so it's reachable from anywhere

1. Push this project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign up, and "Import Project" from that repo.
3. Add the same two environment variables under **Settings → Environment Variables**.
4. Deploy. Vercel gives you a public HTTPS URL you can open from any device, anywhere.

## Notes

- Access control: any signed-up user can read/write all data (RLS policies in `supabase/schema.sql`). Disable "Allow new users to sign up" in Supabase Auth settings if you need to lock that down.
- Currency: vehicle expenses, sale prices, and receipts are assumed to be a single currency (LKR by default — see `formatMoney` in `src/lib/types.ts`). Supplier advances carry their own `currency` + `exchange_rate` since they're typically foreign-currency deposits (JPY/USD); the supplier balance formula sums these against LKR deductions without conversion, matching the source spec — adjust if you need real FX conversion.
- "Sold Fully Closed" is not a hard edit-lock: deleting/editing a receipt after a sale is fully closed will automatically revert the vehicle to "Sold Pending Payment" if the collected total drops below the agreed price.
