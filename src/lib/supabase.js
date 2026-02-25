/* ──────────────────────────────────────────────
   Delhi RoadWatch — Supabase Client Configs
   ────────────────────────────────────────────── */

import { createClient } from '@supabase/supabase-js';

// ── Main DB (delhi-roadwatch) ──
export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Vahaan DB (vehicle registry simulation) ──
export const vahaanDb = createClient(
    import.meta.env.VITE_VAHAAN_DB_URL,
    import.meta.env.VITE_VAHAAN_DB_ANON_KEY
);
