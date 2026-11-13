-- IponWise profile picture support.
-- Run after iponwise_complete_schema.sql.

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'profile-avatars',
    'profile-avatars',
    FALSE,
    5242880,
    ARRAY['image/webp']::TEXT[]
)
ON CONFLICT (id)
DO UPDATE SET
    public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/webp']::TEXT[];

-- The bucket remains private.
-- FastAPI accesses it using the server-side service-role key.
-- Do not expose that key in React or browser requests.

-- storage.objects is Supabase-managed and its ownership/RLS must not be changed
-- from an application migration. The bucket is private, and the backend uses
-- the service-role API for avatar upload, signing, and deletion.