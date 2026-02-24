/* ──────────────────────────────────────────────
   Delhi RoadWatch — Auth Context (Supabase Auth)
   FULLY FIXED VERSION — Rock-solid auth, no infinite loading
   ────────────────────────────────────────────── */

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const SESSION_KEY = 'rw_user';

function saveSession(user) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (e) { /* ignore */ }
}
function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}
function loadSession() {
    try {
        const s = sessionStorage.getItem(SESSION_KEY);
        return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [ready, setReady] = useState(false);

    // Persist user to sessionStorage whenever it changes
    function setUser(user) {
        if (user) {
            saveSession(user);
        } else {
            clearSession();
        }
        setCurrentUser(user);
    }

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            // 1. Immediately check sessionStorage (instant — no flicker)
            const stored = loadSession();
            if (stored && mounted) {
                setCurrentUser(stored);
                setReady(true);
                return; // already have user — done
            }

            // 2. Check Supabase Auth session (for real signups)
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user && mounted) {
                    const enriched = await enrichUser(session.user);
                    if (mounted) {
                        setUser(enriched);
                    }
                }
            } catch (err) {
                console.error('[AUTH] Session check failed:', err);
            }

            if (mounted) setReady(true);
        };

        // Safety net: force ready after 4 seconds no matter what
        const timer = setTimeout(() => { if (mounted && !ready) setReady(true); }, 4000);

        init().finally(() => clearTimeout(timer));

        // Listen for auth state changes from Supabase (e.g., token refresh)
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;
            // Only handle SIGN_OUT from Supabase side; logins are handled explicitly
            if (event === 'SIGNED_OUT') {
                clearSession();
                if (mounted) setCurrentUser(null);
            }
        });

        return () => {
            mounted = false;
            clearTimeout(timer);
            authListener.subscription.unsubscribe();
        };
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

    // ── LOGIN: Direct DB lookup (demo credentials) ──
    // Used by both LoginPage and this context
    async function login(role, identifier, password) {
        try {
            const table = role === 'citizen' ? 'users' : role === 'police' ? 'police' : 'admins';
            const idCol = role === 'citizen' ? 'email' : role === 'police' ? 'police_id' : 'admin_id';

            // Step 1: Direct DB credential check (plain-text password_hash for demo)
            const { data: demoUser } = await supabase
                .from(table)
                .select('*')
                .eq(idCol, identifier)
                .eq('password_hash', password)
                .single();

            if (demoUser) {
                const user = {
                    ...demoUser,
                    role,
                    user_id: demoUser.user_id || demoUser.police_id || demoUser.admin_id
                };
                setUser(user);
                return { success: true, user };
            }

            // Step 2: Try resolving ID → email for authority roles
            let email = identifier;
            if (role === 'police' && !identifier.includes('@')) {
                const { data } = await supabase.from('police').select('email').eq('police_id', identifier).single();
                if (data?.email) email = data.email;
            } else if (role === 'admin' && !identifier.includes('@')) {
                const { data } = await supabase.from('admins').select('email').eq('admin_id', identifier).single();
                if (data?.email) email = data.email;
            }

            // Step 3: Try Supabase Auth login (for signed-up users)
            const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
            if (!authError && data?.user) {
                const enriched = await enrichUser(data.user);
                setUser(enriched);
                return { success: true, user: enriched };
            }

            return { success: false, error: 'Invalid credentials. Please check your ID and password.' };
        } catch (err) {
            console.error('[AUTH] Login crash:', err);
            return { success: false, error: 'Login error: ' + err.message };
        }
    }

    // ── SIGNUP: Creates Supabase Auth user + inserts into users table ──
    async function signup(name, email, phone, aadhaar, password) {
        try {
            // Step 1: Create Supabase Auth account
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: name, phone, aadhaar } }
            });

            if (authError) return { success: false, error: authError.message };

            // Step 2: Insert into users table (so enrichUser can find them)
            const userId = authData.user?.id;
            if (userId) {
                const { error: insertError } = await supabase.from('users').insert([{
                    user_id: userId,
                    name,
                    email,
                    phone,
                    aadhaar,
                    aadhaar_verified: false,
                    password_hash: password,
                    role: 'citizen'
                }]);
                if (insertError) {
                    console.warn('[AUTH] Could not insert user row:', insertError.message);
                    // Not fatal — they can still log in via Supabase Auth
                }
            }

            // Step 3: If email confirmation is disabled, we get a session immediately
            if (authData.session?.user) {
                const enriched = await enrichUser(authData.session.user);
                setUser(enriched);
                return { success: true, user: enriched };
            }

            // Step 4: Email confirmation required
            if (authData.user && !authData.session) {
                return {
                    success: true,
                    needEmailConfirm: true,
                    message: 'Account created! Check your email to confirm your address, then log in.'
                };
            }

            return { success: false, error: 'Signup failed — no user or session returned.' };
        } catch (err) {
            console.error('[AUTH] Signup crash:', err);
            return { success: false, error: 'Signup failed: ' + err.message };
        }
    }

    async function logout() {
        clearSession();
        await supabase.auth.signOut();
        setCurrentUser(null);
    }

    // setUserDirectly: for LoginPage — always persists to sessionStorage
    function setUserDirectly(user) {
        setUser(user);
    }

    return (
        <AuthContext.Provider value={{ currentUser, setUserDirectly, login, signup, logout, ready }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be inside AuthProvider');
    return ctx;
}
