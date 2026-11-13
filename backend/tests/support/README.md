# Database integration tests

The tests in `test_integration_*.py` exercise the real FastAPI routes and real SQL against a
**disposable** PostgreSQL database. They are skipped unless `TEST_DATABASE_URL` is set.

```bash
createdb iponwise_test
psql -d iponwise_test -f tests/support/supabase_shim.sql      # test-only: fakes auth.users / auth.uid()
psql -d iponwise_test -f sql/iponwise_full_setup.sql             # everything, incl. wallet tracking (006)
export TEST_DATABASE_URL=postgresql://postgres@localhost:5432/iponwise_test
pytest
```

Only Supabase token verification is replaced (an `X-Test-User` header stands in for a verified
user). Tables are truncated between tests — never point this at a database that holds real data.

## Test-only Supabase Auth stand-ins

- `stub_supabase_auth.py` maps two fixed tokens (`token-a`, `token-b`) to two fixed users — used by the live contract test.
- `fake_gotrue.py` is a fuller stand-in (email sign-up/in, refresh, logout, simulated Google/Facebook redirect) used by `e2e/`.

Neither is Supabase. Never use them outside local testing.
