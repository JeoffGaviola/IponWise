-- Apply in Supabase SQL Editor after the existing IponWise schema.
-- Balances are user-entered snapshots; this table does not connect to banks or e-wallet providers.
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('ewallet','bank','atm','cash','investment')),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'PHP',
  note VARCHAR(250) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_updated ON public.user_wallets(user_id, updated_at DESC);
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_wallets_select_own ON public.user_wallets;
CREATE POLICY user_wallets_select_own ON public.user_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_wallets_insert_own ON public.user_wallets;
CREATE POLICY user_wallets_insert_own ON public.user_wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_wallets_update_own ON public.user_wallets;
CREATE POLICY user_wallets_update_own ON public.user_wallets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_wallets_delete_own ON public.user_wallets;
CREATE POLICY user_wallets_delete_own ON public.user_wallets FOR DELETE TO authenticated USING (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallets TO authenticated;
