# Car Import Tracker

Tracks car purchases, per-car expenses, supplier payments, and sales — so you can see profit per car and how much you owe each supplier. Built with Next.js and Supabase, deployable to Vercel so it's reachable from anywhere.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a new project (free tier is fine).
2. Once it's ready, open **SQL Editor** in the project dashboard, paste in the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates all the tables, the profit view, and the row-level security policies.
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the two values from step 1:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

`.env.local` is git-ignored, so these values won't be committed.

## 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login` — use "Sign up" to create the first account (anyone who signs up gets full access; this app assumes a small trusted team, not public signups).

## 4. Everyday use

- **Dashboard** (`/`) — all cars, split into in-stock / sold, with total expenses and profit per car.
- **Add car** — purchase details (price, date, chassis number).
- **Car detail** — add expenses (category, supplier, amount, date), see running totals, and mark the car sold to record the sale price/buyer.
- **Suppliers** — add suppliers, record payments to them (optionally tied to a specific car), and see each supplier's running balance (billed vs paid).

## 5. Deploy so it's reachable from anywhere

1. Push this project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign up, and "Import Project" from that repo.
3. In the Vercel project settings, add the same two environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) under **Settings → Environment Variables**.
4. Deploy. Vercel gives you a public HTTPS URL you can open from any device, anywhere.

## Notes

- Access control: any signed-up user can read/write all data (see the RLS policies in `supabase/schema.sql`). This fits a small team; if you ever need public signups blocked, disable "Allow new users to sign up" in Supabase Auth settings and create accounts manually instead.
- Currency: each car/expense/payment stores its own currency code; the dashboard totals assume a single currency for simplicity (adjust `formatMoney` calls in `src/lib/types.ts` if you need multi-currency rollups).
