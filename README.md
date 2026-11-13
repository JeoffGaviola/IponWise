# IponWise

**IponWise is a cross-platform personal savings tracker** built with React + TypeScript (TSX/TS), semantic HTML/CSS, FastAPI, and Supabase-hosted PostgreSQL. The frontend is an installable Progressive Web App (PWA) for desktop and mobile browsers. The web interface is responsive, and the same deployed app can be installed from a supported browser without maintaining separate Android and iOS codebases.

## What's new in this version

| Area | What you get |
|---|---|
| **Sign-in** | A new, human savings-themed sign-in screen. **Continue with Google**, then **Continue with Facebook**, then manual registration (name, email, password + confirm, strength meter). |
| **Login / logout feel** | Full-screen "Signing you in" and "Signing you out" transitions (like the big social apps), so nothing flashes or jumps. |
| **Get started dashboard** | A guided checklist whose progress comes from your *real* data: pick a goal, record a deposit, track an account, build an emergency fund, set a reminder, personalise your profile. A savings jar fills as you go. Hide it for good (saved to your account) or bring it back from Profile & settings. |
| **Goals for real life** | **Goal ideas** for emergencies, hospital bills, tuition, loans/instalments, rent, laptop, phone, motorcycle, car, wedding, travel, business and more, with a **Shuffle ideas** and **Surprise me** button. Pre-filled amounts are *editable estimates*, never prices. |
| **Planners** | *Purchase planner* (full price or down payment + registration/insurance extras) for laptops, phones, vehicles; *instalment planner* (amount × payments) for tuition, loans, rent; the existing emergency-fund planner. A **pace insight** compares each goal with your own recent saving rate. |
| **Wallets & accounts (view only)** | **Scan an e-wallet QR** (camera or screenshot), **add an ATM/debit card** by its number or just the last 4 digits, or add an account manually. Balance history with trend lines, "time to refresh" nudges, and a **Funding check** ("is the money I've set aside for goals really in accounts I track?"). |
| **Savings assistant** | An optional, authenticated Gemini-powered guide can explain recorded savings data, goal progress, and recent spending patterns. It is read-only, rate-limited, and never creates or changes records. |
| **Look & feel** | Soft neumorphic UI (light and dark), responsive from phones to desktops, 44px touch targets on touch screens, reduced-motion support. |
| **Setup help** | Ready-made `.env` files, `node scripts/check-env.mjs` (finds placeholders, leaked secrets, mismatched projects), one-file database setup, and `docs/SUPABASE_SETUP.md`. |

### Tracking, never touching your money

IponWise is a **read-only tracker**. It cannot see, move or spend money.

- A **QR code only identifies an account** — it never contains a balance. After scanning, you type the balance you see in your own wallet app.
- Balances are **snapshots you enter**. IponWise does not log in to GCash, Maya or any bank, and it does not ask for passwords, PINs, CVVs or one-time codes.
- For **ATM/debit cards** the number you type is checked **in your browser** (checksum + network). Only the **last 4 digits and the card network** are sent and stored; the full number is discarded immediately. The API and database also reject anything that looks like a full card number in any text field, and there is no column that could hold a CVV, PIN or expiry date.
- Automatically reading real balances would require a regulated provider/partner integration (for example an open-finance aggregator) and the customer's explicit bank authorisation. That is intentionally **not** built here.

## Implemented features

### Authentication
- Email and password sign-up/sign-in through Supabase Auth.
- Password reset email flow.
- Continue with Google and Continue with Facebook via Supabase OAuth when enabled in the Supabase dashboard.
- Authenticated API requests use the Supabase access token; FastAPI asks Supabase Auth to validate it before accessing user records.

### Savings tracker
- Dashboard with calculated balance, current-month deposits and withdrawals, goal progress, and recent activity.
- Add deposits and withdrawals with amount, category, date, optional note, and optional savings-goal link.
- Delete transactions; the transaction and linked goal progress are updated transactionally in PostgreSQL.
- Search and filter transactions by text, transaction type, and month.
- CSV export of recorded transactions.
- Create savings goals with a target amount, starting saved amount, category, deadline, and visual progress.
- Add goal contributions as deposit transactions.
- Create reminders, assign optional due dates, mark them complete, and activate/pause them. Delivery remains in-app only; scheduled push/email delivery is not enabled.
- Save display name, light/dark/system theme preference, email-summary preference, and savings-reminder preference. Currency selection changes the display symbol only; recorded amounts are not converted.
- Public Terms of Service and Privacy Policy pages are available at `/terms` and `/privacy` while logged out or signed in.
- Authenticated users can upload, replace, retrieve, and remove a profile picture from Settings. Images are validated, resized to WebP, and stored in the private `profile-avatars` Supabase Storage bucket.
- Reports and spending/withdrawal breakdowns based on recorded transactions.
- My wallets & accounts: manually track balances for e-wallets, bank accounts, ATM-linked accounts, cash, and investment accounts; update balances when checked in the provider app or statement. These are manual snapshots, not live financial integrations.
- Optional Gemini savings assistant: answers questions from a minimized, current-user-only snapshot (aggregates, goal progress, transaction categories and amounts without notes, reminder counts, and account totals). Conversations are not stored by IponWise. It does not provide financial, investment, legal, lending, or tax advice.

### Installable cross-platform web app
- PWA manifest and home-screen icon.
- Service worker caches the application shell for faster launch and navigation fallback.
- Responsive UI for desktop, tablet, and mobile viewports.
- The service worker does **not** cache private API responses. Offline transaction entry and later background synchronization are not implemented in this release; signed-in record changes require the API and database to be reachable. Reminders are shown in-app; scheduled email or push delivery is not implemented.

## Architecture

```text
Browser / Installable PWA
  React + Vite + TypeScript/TSX + HTML + CSS
         |
         | Supabase Auth (email/password, Google OAuth, Facebook OAuth)
         | Bearer access token
         v
Python FastAPI REST API
  - verifies access tokens with Supabase Auth
  - obtains user ID from the verified Supabase user
  - validates input and enforces row ownership in every query
  - sends an explicit, minimized assistant request to Gemini only when the user asks
         |
         | PostgreSQL connection string (server only)
         v
Supabase-hosted PostgreSQL
  user_profiles | savings_goals | savings_transactions | savings_reminders | user_wallets
  Row Level Security enabled
```

For the current backend design, the FastAPI service uses the PostgreSQL connection string directly after verifying every caller's token. The backend does not trust a `user_id` supplied by the frontend. Never put `DATABASE_URL`, a database password, a Supabase service-role key, or an OAuth client secret in React environment variables.

## Folder structure

```text
IponWise/
├── README.md
├── docs/
│   ├── SUPABASE_SETUP.md        ← step-by-step: Supabase, Google, Facebook, env files
│   └── screenshots/             ← what the app looks like (captured by the E2E run)
├── scripts/check-env.mjs        ← checks your .env files (no network, never prints secrets)
├── e2e/                         ← real-browser end-to-end test + README
├── frontend/
│   ├── .env  /  .env.local      ← YOUR settings (placeholders to replace); *.example are templates
│   └── src/
│       ├── App.tsx              ← app shell, session transitions, routing between pages
│       ├── pages/               ← Overview, Goals, Wallets, Transactions, Reminders, Reports, Settings, AuthPage
│       ├── components/          ← GetStarted, GoalIdeas, goalHelpers, walletForms, AuthScene, SessionSplash, ui…
│       ├── lib/                 ← card, qr, goalIdeas, onboarding, wallets, goals, validate, format
│       ├── hooks/               ← useAppData, useActions, useForm
│       └── styles/              ← tokens, neumorphism, auth, session, features, layout, components
└── backend/
    ├── .env                     ← YOUR settings (placeholders to replace)
    ├── app/                     ← FastAPI: main, auth, wallets, schemas, ledger, avatars, db
    ├── sql/
    │   ├── iponwise_full_setup.sql   ← run THIS ONE FILE on a new Supabase project
    │   └── 00x_*.sql                 ← the same steps as separate, idempotent migrations
    └── tests/                   ← unit + real-PostgreSQL integration tests, test-only auth stand-ins
```

## Setup step 1 — Supabase PostgreSQL and Auth

> Prefer the illustrated, click-by-click version: **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)**.

1. Create a Supabase project.
2. Open **SQL Editor → New query**, paste the whole of **`backend/sql/iponwise_full_setup.sql`** and run it **once**. That single file creates everything: profiles, goals, transactions, reminders, tracked accounts (with card last-4 + balance history), planning fields, the private avatar bucket, the sign-up → profile trigger (so Google/Facebook users get a profile automatically) and Row Level Security. It is idempotent, so re-running it is safe.
   - Upgrading an existing project instead? Run only what you are missing, in order: `003_user_wallets.sql`, `004_goal_planning.sql`, `005_supabase_social_auth_profiles.sql`, `002_profile_avatars.sql`, then **`006_wallet_tracking_and_onboarding.sql`** (new in this version: QR/card metadata, balance history, "Get started" flag). All are non-destructive.
3. **Project Settings → API**: copy the *Project URL*, the *anon/publishable* key and (backend only) the *service_role* key.
4. **Project Settings → Database**: copy the connection string (URI). Keep its password private.
5. **Authentication → URL Configuration**: set the Site URL for your deployment and add `http://localhost:5173` to *Redirect URLs*.
6. Fill in the env files (next step) and run `node scripts/check-env.mjs`.

Review and test all Row Level Security policies before production use.

## Setup step 2 — Frontend

Requirements: Node.js 22.22.2+ (or Node.js 24.15+ / another version supported by the locked dependency engines) and npm.

```bash
cd frontend
npm install
```

`frontend/.env` (public defaults) and `frontend/.env.local` (your Supabase values) are **already included** with `YOUR_…` placeholders: open them and replace the placeholders with values from your own Supabase project. The `*.example` files are the untouched templates. If you ever need to recreate `.env.local`, copy it from `.env.local.example`:

```powershell
Copy-Item .env.local.example .env.local
```

macOS/Linux:

```bash
cp .env.local.example .env.local
```

Use the following keys in that file:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
VITE_API_BASE_URL=http://localhost:8000
```

Run Vite:

```bash
npm run dev
```

Open the local URL shown by Vite (normally `http://localhost:5173`) and create an account after the full backend setup is complete. Financial records are only loaded from the authenticated API.

## Setup step 3 — FastAPI backend

Requirements: Python 3.11+ recommended.

Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

`backend/.env` is **already included** with `YOUR_…` placeholders (`backend/.env.example` is the template). Replace the placeholders; the keys are:

```env
DATABASE_URL=postgresql+psycopg://YOUR_DB_USER:YOUR_PASSWORD@YOUR_SUPABASE_DB_HOST:5432/postgres?sslmode=require
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY   # server only, never in the frontend
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
APP_ENV=development
GEMINI_API_KEY=YOUR_GEMINI_API_KEY                  # optional; server only
GEMINI_MODEL=gemini-2.5-flash                       # optional override
```

### Optional — enable the Gemini savings assistant

Create a Gemini API key and set `GEMINI_API_KEY` in `backend/.env`; never put this key in a `VITE_` variable or any browser-facing file. `GEMINI_MODEL` defaults to `gemini-2.5-flash` and can be changed to a model enabled for your key. Once the backend is restarted, signed-in users can open the sparkle button in the top bar.

Each question sends Gemini the question, up to six in-browser conversation turns, and a minimized snapshot of that signed-in user's data: currency, ledger totals, goal progress, recent transaction types/categories/amounts/dates (never transaction notes), withdrawal-category totals, reminder counts, and aggregate tracked-account balances (never account names, card tails, or full card numbers). IponWise stores neither Gemini conversations nor a Gemini key in the browser. The backend limits each user to eight assistant questions per minute; run a single worker, or move this limiter to the database/Redis before scaling out.

Then check everything from the project root (it prints no secrets and makes no network calls):

```bash
node scripts/check-env.mjs
```

The exact `DATABASE_URL` varies based on your Supabase project and whether you use a direct or pooled connection. Use the full URI provided by Supabase and keep SSL enabled. Do not commit `backend/.env`.

Start the backend from the `backend` directory:

```bash
uvicorn app.main:app --reload --port 8000
```

Useful URLs:
- API health: http://localhost:8000/api/health
- Interactive endpoint documentation: http://localhost:8000/docs
- OpenAPI JSON: http://localhost:8000/openapi.json

## Testing

```bash
# Backend tests (install `backend/requirements-dev.txt` for pytest); database tests are skipped unless TEST_DATABASE_URL is set
cd backend && pytest -q

# Backend against a REAL, disposable PostgreSQL (see backend/tests/support/README.md for setup)
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/iponwise_test pytest -q

# Frontend: TypeScript check, unit + component + whole-app tests, then the production build
cd frontend && npm run typecheck && npm test && npm run build

# Optional live contract test: the real frontend API client against a running FastAPI + PostgreSQL
LIVE_API=1 VITE_API_BASE_URL=http://127.0.0.1:8000 npx vitest run src/contract.live.test.ts

# Real-browser end-to-end test (React build + FastAPI + PostgreSQL + a local Supabase Auth stand-in): see e2e/README.md
cd e2e && npm install && npm run e2e
```

What the database tests cover: authentication required on every data route, cross-user isolation (read, edit, delete, linking to another user's goal), balances beyond the 100-row page size, goal contribution/withdrawal limits, edit/delete recalculation, the non-negative-balance rule when deleting or shrinking a deposit, goal planning fields, wallets (never mixed into the ledger balance), reminders, profile persistence, filters/pagination, and report windows.

**Verification status and limits for this package** (run on the final code):

| Check | Result |
|---|---|
| Backend tests without PostgreSQL | **25 passed, 39 skipped** |
| Frontend: TypeScript | **0 errors** |
| Frontend: unit + component + whole-app tests | **189 passed, 8 skipped** |
| Live contract and real-browser end-to-end | Not run in this workspace |
| Production build | succeeds |

What these runs do **not** prove: the Google and Facebook steps used a *simulated* provider (a local Supabase Auth stand-in), so your real provider credentials still need testing with `docs/SUPABASE_SETUP.md`; QR scanning was verified through image upload and pasted text, not a physical phone camera (browsers also require https or localhost for the camera); and it has not been tested against a live Supabase project, a production deployment, or real email delivery.

## Screenshots

| | |
|---|---|
| ![Sign-in](docs/screenshots/01-login-desktop.png) | ![Get started](docs/screenshots/11-dashboard-desktop.png) |
| ![Goals and ideas](docs/screenshots/21-savings-desktop.png) | ![Wallets](docs/screenshots/10-wallets-desktop.png) |
| ![Phone sign-in](docs/screenshots/20-login-phone.png) | ![Phone guide](docs/screenshots/22-guide-phone.png) |

## Step 4 — Enable Google and Facebook sign-in

OAuth credentials belong in Supabase's Auth provider settings, not in React `.env.local`. The app buttons call `supabase.auth.signInWithOAuth()` for Google and Facebook. On the first successful provider sign-in, Supabase adds the identity to `auth.users`; the SQL trigger in `005_supabase_social_auth_profiles.sql` creates the corresponding app profile. Subsequent sign-ins refresh the profile metadata.

- **Google setup:** https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- **Facebook setup:** https://supabase.com/docs/guides/auth/social-sign-in/auth-facebook
- **Supabase app redirect allow-list:** https://supabase.com/docs/guides/auth/redirect-urls

1. In Supabase, open **Authentication → Sign In / Providers** and enable Google and Facebook. Copy the callback URL shown for the project; it follows `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Google Cloud, add the app origins (such as `http://localhost:5173` and your production site origin) under **Authorized JavaScript origins**, and add the Supabase callback URL under **Authorized redirect URIs**. In Facebook Login settings, add that same Supabase callback as a **Valid OAuth Redirect URI** and ensure the email permission is available. Enter each provider's client ID and secret in the matching Supabase provider settings.
3. In Supabase **Authentication → URL Configuration**, set the Site URL to the deployed frontend and add `http://localhost:5173`, `http://127.0.0.1:5173`, and the exact production frontend URL under **Redirect URLs**. Keep only the URLs you actually use in production.
4. Run `005_supabase_social_auth_profiles.sql`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env.local`, and test with a separate Google account and Facebook account. Confirm each account appears in **Authentication → Users** and has a matching row in `public.user_profiles`.

To check which providers have been recorded after sign-in, run this read-only query in the Supabase SQL Editor:

```sql
select id, email_address, auth_provider, display_name, last_sign_in_at
from public.user_profiles
order by last_sign_in_at desc nulls last;
```

If a provider is disabled, OAuth will fail even though the button is visible. The app displays a user-readable error; email/password sign-in remains available. Supabase may require the Facebook app to be in Development/Test mode with the tester account added, or to pass the provider's review before general use.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Public API and PostgreSQL connectivity status |
| GET | `/api/me` | Current verified Supabase user |
| GET/PATCH | `/api/profile` | Read/update account preferences, including `onboarding_dismissed` (Get started guide) |
| GET | `/api/profile/avatar` | Return the authenticated user's short-lived signed avatar URL |
| PUT | `/api/profile/avatar` | Validate, normalize, and store an authenticated user's avatar |
| DELETE | `/api/profile/avatar` | Remove the authenticated user's avatar and restore initials |
| GET/POST | `/api/transactions` | List/create transactions; GET supports `search`, `type`, `category`, `month`, `start_date`, `end_date`, `sort_by`, `sort_order`, `limit`, and `offset` |
| PUT/DELETE | `/api/transactions/{id}` | Update/delete a transaction |
| GET/POST | `/api/goals` | List/create goals (`name`, `category`, `target`, `saved`, `deadline`, `priority`, `description`, `contributionFrequency`) |
| PATCH/DELETE | `/api/goals/{id}` | Update/delete a goal |
| GET/POST | `/api/wallets` | List tracked accounts (with a 12-point balance `trend`) / add one. Cards accept only `card_last4` + `card_network`; QR accounts only a 4-character `account_tail`. Full card numbers are rejected. |
| PATCH/DELETE | `/api/wallets/{id}` | Update/delete an account. Sending `balance` records a history point (`update`, or `check-in` if unchanged). |
| GET | `/api/wallets/{id}/history` | Recorded balance snapshots for one account, newest first |
| GET/POST | `/api/reminders` | List/create reminders |
| PATCH/DELETE | `/api/reminders/{id}` | Update/delete a reminder |
| GET | `/api/dashboard` | Server-calculated balance, current-month totals, goal totals/counts and transaction count (the UI uses this, not a client-side sum) |
| GET | `/api/reports` | Server-aggregated six-month movement and withdrawal categories |
| POST | `/api/assistant` | Read-only Gemini savings guidance for the authenticated user; accepts a message and up to six local conversation turns |

All routes that read or mutate user records require a valid `Authorization: Bearer <supabase_access_token>` header. The user ID is obtained from Supabase Auth. Request bodies cannot choose a different owner's user ID.

## Balance and savings-goal rules

- The account balance is calculated from the signed total of recorded transactions: deposits minus withdrawals.
- Goal-linked transactions adjust that goal's saved amount in the same PostgreSQL transaction, and deleting a linked transaction reverses its contribution.
- Goal-linked contributions cannot exceed the target, goal targets cannot be reduced below the amount already saved, linked withdrawals cannot exceed goal funds, and withdrawals cannot make the recorded balance negative or consume funds reserved in other goals.
- Deleting or shrinking a deposit is rejected if it would push the recorded balance below zero (for example, when withdrawals already depend on it). A balance that was already negative from older data does not block unrelated edits.
- Goal progress that would become negative is rejected rather than silently clamped to zero.
- A goal has a priority (essential / high / normal / optional), optional description and a preferred contribution schedule. The UI derives status (completed, overdue, due soon, behind schedule, on track) and insights only from the goal's own data; the savings and emergency-fund planners are estimates from numbers the user enters, not financial advice.
- Money is formatted in the currency chosen in Profile & settings. Amounts are stored as exact `NUMERIC`; the calculator works in integer cents and rounds contributions up to the next cent.
- Starting savings on a newly created goal is an initial value, not a bank-verified balance.
- Amounts represent what the user records. IponWise does not connect to or verify bank accounts.
- Reminders in this version are saved reminder records and on-screen status controls; a scheduled background delivery service for push/email notifications still needs to be added.
- The savings calculator uses deterministic calendar-period arithmetic in `frontend/src/calculator.ts`; it does not use AI or claim bank-verified balances.

## Real-world scenarios covered by automated tests

- A user records a monthly allowance, contributes part of it to an emergency-fund goal, and withdraws from that linked goal. The recorded balance and goal balance are updated independently and remain consistent.
- A user cannot contribute more than a goal target, lower a target below its saved amount, withdraw more than the overall recorded balance, or consume funds reserved in other goals.
- A user can calculate daily, weekly, or calendar-month contribution schedules for a future target date. Completed goals require no further contribution, while incomplete goals with past dates are rejected.
- Reminder records support an optional due date and completion state while retaining the existing active/paused behavior.

## Frontend structure and design system

- `src/styles/tokens.css` holds every colour as a semantic token (primary, success, error, warning, info, neutral, inflow/outflow, disabled) for light and dark themes (`system` follows the OS). Component styles reference tokens only. Measured text/background contrast is ≥ 4.5:1 for all semantic pairs in both themes.
- Withdrawals use the neutral "outflow" treatment, not error red; red is reserved for errors and destructive actions. Status is always paired with an icon and a label, never colour alone.
- `src/components/` — `Toast` (central notifications: de-duplicated, errors persist until dismissed, `aria-live`), `Modal`/`ConfirmDialog` (focus trap, Escape, focus restore), `ui` primitives, forms, charts. `src/hooks/useAppData` loads server data; `useActions` wraps every mutation (duplicate-submit guard, success toast only after server confirmation, inline vs toast error routing). `src/api.ts` normalises errors, attaches the Supabase token, applies timeouts and never auto-retries mutations.
- Motion respects `prefers-reduced-motion`.
- There is no demo/mock-data mode: without Supabase configuration the sign-in screen says so.

## Architectural note

The backend keeps authentication, persistence, validation, and transaction invariants in separate modules. FastAPI dependencies provide composition-based dependency injection for the authenticated user and database session. The transaction and goal operations act as focused services at the route boundary, while Pydantic models and PostgreSQL constraints provide shared contracts. No artificial inheritance hierarchy is needed for this domain; interchangeable frontend calculation frequencies are represented as explicit strategies/data rather than hidden polymorphism.

## Deployment notes

- Deploy `frontend` to a static host that supports Vite (for example, Vercel or Netlify) and `backend` to a Python ASGI host.
- Set production `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL` in frontend build settings.
- Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `FRONTEND_ORIGINS` as private backend environment variables.
- Add the production frontend URL to Supabase's allowed redirect URLs and backend CORS origins.
- Use HTTPS, configure a privacy policy and terms, test auth expiry and cross-user access, and verify backups before accepting real personal-finance data.
- Configure the static host to rewrite `/terms` and `/privacy` to `index.html` so direct legal-page URLs work after deployment.
- A browser-installable PWA is cross-platform web delivery. Packaging as a native store application can be a future phase (for example, with Capacitor), and would require additional platform testing.

IponWise is a personal savings record-keeping application, not a bank, payment processor, or financial adviser.
