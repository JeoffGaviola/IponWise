-- Prevent duplicate privacy-safe wallet identifiers per user.
-- Existing duplicates are reported and left untouched for owner review.
DO $$
DECLARE
    duplicate_count integer;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT user_id, lower(provider), card_last4
        FROM public.user_wallets
        WHERE card_last4 IS NOT NULL
        GROUP BY user_id, lower(provider), card_last4
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Skipping card identifier index: % duplicate groups require review.', duplicate_count;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_wallet_card_identifier
            ON public.user_wallets (user_id, lower(provider), card_last4)
            WHERE card_last4 IS NOT NULL;
    END IF;

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT user_id, lower(provider), account_tail
        FROM public.user_wallets
        WHERE account_tail IS NOT NULL
        GROUP BY user_id, lower(provider), account_tail
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Skipping account identifier index: % duplicate groups require review.', duplicate_count;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_wallet_account_identifier
            ON public.user_wallets (user_id, lower(provider), account_tail)
            WHERE account_tail IS NOT NULL;
    END IF;
END $$;
