/* ──────────────────────────────────────────────
   Delhi RoadWatch — Supabase Client Configs
   ────────────────────────────────────────────── */

import { createClient } from '@supabase/supabase-js';

// ── Main DB (delhi-roadwatch) ──
export const supabase = createClient(
    'https://nucoxhrfojsvjrrvxqmc.supabase.co',
    'sb_publishable_chwAmq0kxkOgWxIaddrAPQ__R5vyBnD'
);

// ── Vahaan DB (vehicle registry simulation) ──
export const vahaanDb = createClient(
    'https://nibajbylccmzluppaesk.supabase.co',
    'sb_publishable_hSgQLHFfh7yOdz33bYFELw_hHOPbjqb'
);
