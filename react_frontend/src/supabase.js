// supabase.js - creates the one shared Supabase client (the database + realtime
// connection) from the VITE_SUPABASE_* env vars. Exports null when they're
// missing so the app can still render in a local-only mode. The key used here
// is the public "anon" key by design - see README.md for what that means for
// security.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when env vars are missing so the app can fall back to local-only mode
export const supabase = url && key ? createClient(url, key) : null;
