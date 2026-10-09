# Goal Track

German-language insurance sales dashboard with a responsive dark iOS interface, Next.js App Router, TypeScript, Tailwind CSS and Supabase Auth/Postgres. Designed for one invitation-only team and deployment through GitHub to Vercel.

## Run locally

Use Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Without Supabase environment variables, the root shows a **clearly labeled interactive demo**. Its sample entries are held only in memory and reset on reload or month change. `/demo` remains available after Supabase is connected. It does not create accounts or write to the database. Production sign-in never falls back to demo data after a database/auth error.

## Connect Supabase

1. Create a Supabase project. Run all files in `supabase/migrations/` in filename order, each once in its own SQL Editor query (or use the Supabase CLI migration workflow). For an existing installation, run only unapplied migrations; see the update instructions below.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the project's Connect dialog. The application uses no service-role key. Restart the local server after changing environment variables.
3. Under Authentication → Sign In / Providers → Email, leave email/password sign-in enabled and **disable public sign-ups**. Set a minimum password length of 12. This manual-account workflow does not require SMTP. Do not use “Send invitation”: it sends an email that may be blocked without a custom SMTP provider.
4. Under Authentication → Users, click **Add user → Create new user**. Enter the partner's real email address and a unique, strong temporary password. Leave **Auto confirm user?** checked. Supabase states that this form does not send a confirmation email. The existing database trigger creates an **inactive** profile, so creating an Auth user alone does not grant team access.
5. Activate the partner and set the display name in the trusted SQL Editor after checking that the email is correct:

   ```sql
   update public.profiles
   set full_name = 'Partner Name', active = true
   where id = (select id from auth.users where lower(email) = lower('partner@example.com'))
   returning full_name, active;
   ```

   The query must return **one row** with the expected name and `active = true`. If it returns no rows, check the address in Authentication → Users and the SQL query before continuing. Repeat for each partner. Accounts cannot activate themselves through the app or user metadata. To revoke dashboard and data access, set `active = false`; Auth sign-in may still succeed but the app blocks the account. Personal data stays stored until deliberately deleted by the operator.

6. Give the partner the app URL, email address and temporary password through a trusted private channel. The partner signs in at `/login`, opens **Mein Konto → Passwort ändern**, and enters the temporary and new password. The change requires the current password and does not send email. The administrator must reset a forgotten password through Supabase Auth administration; the public login page deliberately does not offer email recovery without SMTP. Never put passwords in SQL scripts, GitHub, screenshots or shared documents. There is no public registration page.

For production set the Supabase **Site URL** to the canonical app origin. The old invite/recovery callback remains for installations that later configure SMTP, but is not part of this manual workflow. Keep separate Supabase projects for staging and production when available.

## Data and calculations

- `profiles`: private account profile, display name, operator-managed active membership and team visibility. The Moritz Kissner profile is excluded from both team rankings by the October 7 migration; its login and historical entries remain intact.
- `monthly_goals`: per-user, per-month targets, with one row per user/month. The baseline is **10,000 BWS** until the user saves a custom target for that month. Goals never carry over implicitly.
- `sales_entries`: positive BWS amounts with two decimal places, one of eleven insurance products, transaction type (`Neuvertrag` or `Vertragsumstellung`), actual completion date and an optional customer name. The customer name is visible only to the partner who entered it; it is never returned by the team leaderboard functions or sharing text. Historical notes remain visible privately as notes and are not reclassified as customer names. The product list includes Recht und Heim, Reis Protect 365, Top Schutzbrief and Lebensversicherung. Historical Kfz records remain readable and counted. Historical transaction types are unknown (`NULL`), displayed as “Altbestand · Vertragsart nicht erfasst”. New writes reject Kfz and explicitly null/invalid transaction types. Future-dated entries are blocked in both the server action and database.
- `cancellation_entries`: separate, private Storno journal with a positive BWS amount, booking date and optional short reason. A Storno is deducted in its booking month and day even if the original contract was sold earlier; it does not alter or delete that sale. Only its author can read/delete its detail row. Future booking dates and non-positive amounts are rejected.
- `fixed_costs`: private, recurring personal cost items in EUR with a name, positive amount and monthly/quarterly/yearly cadence. Quarterly amounts are divided by 3 and yearly amounts by 12 for the monthly plan. Authenticated app users, including team leads, can read and change only their own rows through RLS and server-side ownership checks. Fixed costs never enter team RPCs or sharing text. Supabase project owners and service-role credentials retain administrative database access because they bypass RLS; do not expose service-role credentials to the client.
- `team_leaderboard(date)`: narrowly scoped authenticated aggregate function. Exposes visible active partners' names, IDs, BWS totals, targets and entry counts for the selected month. It never returns their individual records, categories, customer names, notes or email addresses. It intentionally uses `SECURITY DEFINER`, a fixed empty search path, an explicit membership check and restricted execute grants.
- Row-level security and column/table grants protect private rows. No client-supplied user ID is trusted by server actions; the server verifies the current user. Database policies independently enforce ownership and membership, including direct API calls.
- **BWS Gesamt** = that month's gross sales BWS minus that month's Storno BWS. It can be negative if cancellations exceed sales. **Noch offen** = max(target − net BWS, 0). Goal progress is clamped at zero for negative net BWS, while the actual negative BWS remains visible.
- **Monatsziel der Agentur** = sum of all visible active partners' targets for the selected month (10,000 BWS per partner without a saved goal). Agency progress = their combined monthly BWS ÷ combined targets. Inactive or hidden partners are excluded. Percentages may exceed 100%; the bar caps at 100% and remaining BWS at zero.
- **Tagessieg** = highest positive net BWS (sales minus Storno) booked today in Europe/Berlin. Every tied leader gets the badge; a non-positive top total produces no winner. This is the current lead, not an archived award. It is independent of the selected month. `team_daily_leaderboard()` calculates the date inside Postgres on every call and exposes only member names, IDs, daily totals and the Berlin date. Backdated entries affect their booking day/month, not today's ranking. No scheduled reset is needed: the next refresh after Berlin midnight uses the new day, including DST and year boundaries.
- The personal **Übersicht** is the first view after sign-in. Navigation continues with **Meine Einträge**, **Meine Fixkosten**, and **Team**. The private fixed-cost view supports create/edit/delete, a monthly total, and a donut chart grouped by item name. Its BWS-to-cost percentage is explicitly a numeric orientation, not real break-even or earned commission: BWS is a Bewertungssumme, not euros available to pay costs. The Team view's **Tagesbewertung** ranks every visible active partner by today's BWS, highlights the positive top amount (including ties), and keeps every visible partner at 0 BWS when nobody has sold yet. BWS is never displayed as commission in euros. The adjacent **Tabelle teilen** button shares a dated daily BWS summary (or copies it on browsers without native sharing). A chart titled **Unsere Performance** compares today's BWS for every visible partner. The daily figures refresh with the team data every 15 seconds and after Berlin midnight. Previous days remain stored for monthly totals; only the live daily ranking switches to the new day. The monthly leaderboard does not show a daily-winner badge, and team completion counts are labeled as monthly.
- **Prognose** = achieved ÷ elapsed calendar days × days in month. Its percent is projected BWS ÷ target × 100. Past months use their actual final total. Remaining daily BWS uses the remaining calendar days after today; on the last day it shows what is needed today. Calendar boundaries use Europe/Berlin.
- After a successful add/delete or goal change, the UI recalculates and reloads authoritative server data immediately. Other connected partners see new team totals on the next **15-second refresh**, or immediately when refocusing the app. Hidden tabs do not poll. Monthly history is isolated by sale date. All visible active partners appear even with zero sales.
- Each add-entry modal uses one UUID throughout retries to avoid duplicate entries after an ambiguous network response. Entries can be deleted with confirmation; corrections are made by deleting and re-entering.

## Deploy on Vercel with GitHub

For the October 2026 updates, run each unapplied migration in filename order in the existing production Supabase project before publishing the corresponding app version. The product constraint stays `NOT VALID` so historical Kfz entries remain readable. The first October 7 migration adds private customer names and excludes the one matching Moritz Kissner profile from team rankings without deleting its account or entries. Run `202610070002_cancellation_entries.sql` before publishing the Storno form: it adds the private Storno journal and net team aggregates while leaving historical sales intact. Run each migration only once.

Run `202610090001_private_fixed_costs.sql` before publishing the private Fixkosten view. It creates only the new own-row table; no existing sales, Storno or team data is changed.

1. Create a GitHub repository and push this project, including `package-lock.json`. Do not commit `.env.local`.
2. Import the repository in Vercel. Framework: **Next.js**. Use Node.js 24.x, install command `npm ci`, build command `npm run build`, and the default Next.js output directory.
3. Add the two Supabase environment variables for Production (and your staging credentials for Preview if needed). Deploy.
4. Set the production Supabase Site URL to the deployed origin, then create and activate partner accounts using the manual workflow above. No mail server is required.
5. Vercel automatically builds deployments on GitHub pushes; the production branch updates production and pull requests receive previews. `.github/workflows/ci.yml` runs tests and the production build on pushes and PRs.

No Vercel, GitHub or Supabase account was provisioned automatically. The build succeeds without credentials; actual private accounts and durable cross-user data require the setup above.

## Update an existing production installation

1. Run any **unapplied** files in `supabase/migrations/` in filename order, each in a **new** Supabase SQL Editor query, before deploying code that needs them. Run each migration once. For the October 7 change, confirm exactly one profile matches `Moritz Kissner` before running `202610070001_private_customer_names_team_visibility.sql`; it fails atomically if the match is not unique. Do not rerun the original schema. No sales entries are deleted or recategorized.
2. Publish the updated source and lockfile to the existing GitHub production branch, including the new migration and `eslint.config.mjs`. Vercel runs the existing `npm run build` command, which now checks lint before compiling. No new environment variables, service-role key, SMTP or Realtime configuration are needed.
3. Wait for Vercel's deployment to be Ready, then open `https://goalcheck.vercel.app`. Verify both transaction types in the form and persistence after reloading. Check a historical Kfz record if present, the team agency goal, and the daily badge.
4. With two real active accounts, save an entry under account A and verify account B's team total/agency progress/daily result changes within 15 seconds or on refocus. Change A's target and verify the combined target changes. Remove the test entry when finished.

The new category check and transaction-type-required check deliberately use PostgreSQL `NOT VALID`: existing Kfz/unknown-type rows are grandfathered, while new inserts and updates must meet the checks. Do not validate these constraints without first deciding how to handle the historical records. All original RLS policies remain in place. A new row from a pre-update client that omits transaction type defaults to Neuvertrag during rollout; the updated client always supplies a validated type. Old clients can no longer submit Kfz, so refresh browsers after deployment.

If deployment fails, fix and redeploy the frontend; keep the additive migration. The previous monthly aggregate function is unchanged, so the previous frontend remains readable. Do not rerun the first migration or delete historical data to resolve a rollout issue.

## Verification

```sh
npm test
npm run build
npm run test:e2e
```

Automated tests cover calculations, decimal precision, date boundaries, leaderboard reordering and invalid inputs. Database tests execute the migration in an isolated PostgreSQL-compatible PGlite database to exercise row ownership, membership, aggregate totals and direct API-style writes. They emulate Supabase's `auth.uid()` and roles, not Supabase email delivery or the hosted Auth service. Browser tests verify entry creation, goal changes, leaderboard updates, filtering, deletion and the manual-account login screen at desktop and iPhone-sized viewports. They use installed Microsoft Edge on Windows; on Linux, first run `npx playwright install --with-deps chromium`. CI runs these browser tests too.

The `--webpack` compiler option is intentional: it avoids a Turbopack incompatibility with Windows OneDrive reparse points in this workspace and is also supported on Vercel. Dependencies are pinned and the lockfile is committed-ready for reproducible installs. `npm run format` formats source files.

Before production use, verify with two real manually created accounts: add an entry as A, confirm A's metrics and B's team table update; confirm B cannot read/delete A's detail rows; reload to confirm persistence; change a monthly goal; test in-app password change with the temporary password, mobile layout, account deactivation and the next-month boundary. Configure Supabase backups/retention and operational monitoring to match your team's needs.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Supabase admin user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Supabase password changes](https://supabase.com/docs/guides/auth/passwords).
