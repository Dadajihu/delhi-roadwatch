/* ──────────────────────────────────────────────
   Delhi RoadWatch — Auth Context (Supabase Auth)
   BULLETPROOF VERSION — No more infinite loading
   ────────────────────────────────────────────── */

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [ready, setReady] = useState(false); // true once initial check is done

    useEffect(() => {
        let mounted = true;

        const checkUser = async () => {
            // 1. Check sessionStorage first (from direct DB login fallback)
            try {
                const stored = sessionStorage.getItem('rw_user');
                if (stored && mounted) {
                    const user = JSON.parse(stored);
                    setCurrentUser(user);
                    setReady(true);
                    return; // Skip Supabase check — we already have the user
                }
            } catch (e) { /* ignore parse errors */ }

            // 2. Check Supabase Auth session
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user && mounted) {
                    const enriched = await enrichUser(session.user);
                    if (mounted) setCurrentUser(enriched);
                }
            } catch (err) {
                console.error('[AUTH] Session check failed:', err);
            }
            if (mounted) setReady(true);
        };

        // Force ready after 3 seconds no matter what
        const timer = setTimeout(() => { if (mounted) setReady(true); }, 3000);
        checkUser().finally(() => clearTimeout(timer));

        const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
            try {
                if (session?.user && mounted) {
                    const enriched = await enrichUser(session.user);
                    if (mounted) setCurrentUser(enriched);
                } else if (mounted) {
                    setCurrentUser(null);
                }
            } catch (err) {
                console.error('[AUTH] State change error:', err);
            }
        });

        return () => { mounted = false; authListener.subscription.unsubscribe(); };
    }, []);

    async function enrichUser(authUser) {
        try {
            const email = authUser.email;

            const { data: citizen } = await supabase.from('users').select('*').eq('email', email).single();
            if (citizen) return { ...citizen, auth_id: authUser.id, role: 'citizen', user_id: citizen.user_id };

            const { data: police } = await supabase.from('police').select('*').eq('email', email).single();
            if (police) return { ...police, auth_id: authUser.id, role: 'police', user_id: police.police_id };

            const { data: admin } = await supabase.from('admins').select('*').eq('email', email).single();
            if (admin) return { ...admin, auth_id: authUser.id, role: 'admin', user_id: admin.admin_id };

            return { email, role: 'citizen', auth_id: authUser.id };
        } catch (err) {
            console.error('[AUTH] enrichUser error:', err);
            return { email: authUser.email, role: 'citizen', auth_id: authUser.id };
        }
    }

    async function login(role, identifier, password) {
        try {
            // ── STEP 1: Try demo/legacy login FIRST (fast, no network auth call) ──
            let table = role === 'citizen' ? 'users' : role === 'police' ? 'police' : 'admins';
            let idCol = role === 'citizen' ? 'email' : role === 'police' ? 'police_id' : 'admin_id';

            console.log('[LOGIN] Step 1: Demo query →', { table, idCol, identifier, password });

            const { data: demoUser, error: demoError } = await supabase
                .from(table)
                .select('*')
                .eq(idCol, identifier)
                .eq('password_hash', password)
                .single();

            console.log('[LOGIN] Demo result:', { demoUser, demoError });

            if (demoUser) {
                const user = {
                    ...demoUser,
                    role,
                    user_id: demoUser.user_id || demoUser.police_id || demoUser.admin_id
                };
                setCurrentUser(user);
                return { success: true, user };
            }

            // ── STEP 2: Resolve ID to email for authority roles ──
            let email = identifier;
            if (role === 'police' && !identifier.includes('@')) {
                const { data } = await supabase.from('police').select('email').eq('police_id', identifier).single();
                if (data?.email) email = data.email;
            } else if (role === 'admin' && !identifier.includes('@')) {
                const { data } = await supabase.from('admins').select('email').eq('admin_id', identifier).single();
                if (data?.email) email = data.email;
            }

            // ── STEP 3: Try Supabase Auth (for users who signed up via auth system) ──
            const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

            if (!authError && data.user) {
                const enriched = await enrichUser(data.user);
                setCurrentUser(enriched);
                return { success: true, user: enriched };
            }

            return { success: false, error: authError?.message || 'Invalid credentials.' };
        } catch (err) {
            console.error('[AUTH] Login crash:', err);
            return { success: false, error: 'Login failed: ' + err.message };
        }
    }

    async function signup(name, email, phone, aadhaar, password) {
        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: name, phone: phone, aadhaar: aadhaar } }
            });

            if (authError) return { success: false, error: authError.message };

            if (!authData.user && !authData.session) {
                return { success: false, error: 'An account with this email may already exist.' };
            }

            if (!authData.session) {
                return { success: false, error: 'Please disable "Confirm email" in Supabase Dashboard → Authentication → Providers → Email.' };
            }

            const enriched = await enrichUser(authData.session.user);
            setCurrentUser(enriched);
            return { success: true, user: enriched };
        } catch (err) {
            console.error('[AUTH] Signup crash:', err);
            return { success: false, error: 'Signup failed: ' + err.message };
        }
    }

    async function logout() {
        sessionStorage.removeItem('rw_user');
        await supabase.auth.signOut();
        setCurrentUser(null);
    }

    return (
        <AuthContext.Provider value={{ currentUser, login, signup, logout, ready }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be inside AuthProvider');
    return ctx;
}
