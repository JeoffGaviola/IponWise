# End-to-end browser test

Drives a **real browser** through the **real React build**, which talks to the **real FastAPI backend** and **real PostgreSQL**.
It registers a user, watches the sign-in/out transitions, uses the Get started guide, creates goals from ideas, adds an ATM card
and a scanned QR (and proves the full card number never leaves the browser), checks balance history, hides/restores the guide,
signs in with the "Google" and "Facebook" buttons, and checks that every main page fits phone, tablet and desktop screens.
Screenshots go to `e2e/screenshots/`.

**What is simulated:** only Supabase Auth, using `backend/tests/support/fake_gotrue.py`. The "Google" and "Facebook" steps are a
*simulated provider round trip* — they prove the app handles the redirect, tokens and profile creation correctly, **not** that
your Google/Facebook app credentials are configured. Test those yourself using `docs/SUPABASE_SETUP.md`.

## Run it

```bash
# 1. a disposable PostgreSQL with the schema (never a database with real data)
createdb iponwise_e2e
psql -d iponwise_e2e -f backend/tests/support/supabase_shim.sql
psql -d iponwise_e2e -f backend/sql/iponwise_full_setup.sql
export DATABASE_URL=postgresql://postgres@localhost:5432/iponwise_e2e

# 2. the Supabase Auth stand-in (TEST ONLY)
cd backend && python tests/support/fake_gotrue.py 54321 &

# 3. the API, pointed at that stand-in
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=local FRONTEND_ORIGINS=http://127.0.0.1:4173 \
  python -m uvicorn app.main:app --port 8000 &

# 4. the production build of the frontend, pointed at both
cd ../frontend && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=local \
  VITE_API_BASE_URL=http://127.0.0.1:8000 npm run build && npx vite preview --port 4173 &

# 5. the test
cd ../e2e && npm install
CHROME_PATH="/path/to/chrome" npm run e2e      # macOS: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

If `CHROME_PATH` is not set, the optional bundled `@sparticuz/chromium` (Linux only) is used.
