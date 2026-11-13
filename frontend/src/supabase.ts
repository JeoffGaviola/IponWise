import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const looksLikeTemplate = (value: string) => !value || /YOUR_|REPLACE_ME|CHANGE_ME|example\.com/i.test(value);
const hasValidUrl = (() => {
  if (!supabaseUrl || looksLikeTemplate(supabaseUrl)) return false;
  try {
    const parsed = new URL(supabaseUrl);
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
})();

// Avoid treating copied example values as real credentials.
export const isSupabaseConfigured = hasValidUrl && !looksLikeTemplate(supabaseAnonKey);
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
