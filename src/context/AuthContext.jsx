/* ──────────────────────────────────────────────
   Delhi RoadWatch — Auth Context (Supabase Auth)
   ────────────────────────────────────────────── */

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Initial check
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const enriched = await enrichUser(session.user);
                setCurrentUser(enriched);
            }
            setLoading(false);
        };
        checkUser();

        // 2. Listen for changes
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                const enriched = await enrichUser(session.user);
                setCurrentUser(enriched);
            } else {
                setCurrentUser(null);
            }
            setLoading(false);
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    // Helper to get profile data from our custom tables (users, police, admins)
    // Returns the enriched user object directly
    async function enrichUser(authUser) {
        const email = authUser.email;
        let enriched = null;

        // Try citizen
        const { data: citizen } = await supabase.from('users').select('*').eq('email', email).single();
        if (citizen) {
            enriched = { ...citizen, auth_id: authUser.id, role: 'citizen', user_id: citizen.user_id };
        }
        // Try police
        else if (!enriched) {
            const { data: police } = await supabase.from('police').select('*').eq('email', email).single();
            if (police) enriched = { ...police, auth_id: authUser.id, role: 'police', user_id: police.police_id };
        }
        // Try admin
        else if (!enriched) {
            const { data: admin } = await supabase.from('admins').select('*').eq('email', email).single();
            if (admin) enriched = { ...admin, auth_id: authUser.id, role: 'admin', user_id: admin.admin_id };
        }

        return enriched || { email, role: 'citizen', auth_id: authUser.id };
    }

    async function login(role, identifier, password) {
        setLoading(true);
        try {
            let email = identifier;

            // 1. Resolve ID to Email for Authority roles
            if (role === 'police' && !identifier.includes('@')) {
                const { data } = await supabase.from('police').select('email').eq('police_id', identifier).single();
                if (data) email = data.email;
            } else if (role === 'admin' && !identifier.includes('@')) {
                const { data } = await supabase.from('admins').select('email').eq('admin_id', identifier).single();
                if (data) email = data.email;
            }

            // 2. Try Supabase Auth
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (!authError && data.user) {
                const enriched = await enrichUser(data.user);
                setCurrentUser(enriched);
                setLoading(false);
                return { success: true, user: enriched };
            }

            // 3. Demo Fallback: Check custom tables if Auth fails (allows arjun@demo.com style logins)
            console.warn("Auth Service failed, checking demo fallback...");
            let table = role === 'citizen' ? 'users' : role === 'police' ? 'police' : 'admins';
            let idCol = role === 'citizen' ? 'email' : role === 'police' ? 'police_id' : 'admin_id';

            const { data: legacyUser, error: legacyError } = await supabase
                .from(table)
                .select('*')
                .eq(idCol, identifier)
                .eq('password_hash', password)
                .single();

            if (legacyUser) {
                const user = {
                    ...legacyUser,
                    role,
                    user_id: legacyUser.user_id || legacyUser.police_id || legacyUser.admin_id
                };
                setCurrentUser(user);
                setLoading(false);
                return { success: true, user };
            }

            setLoading(false);
            return { success: false, error: authError?.message || legacyError?.message || "Invalid credentials." };
        } catch (err) {
            console.error('Login crash:', err);
            setLoading(false);
            return { success: false, error: 'Login failed: ' + err.message };
        }
    }

    async function signup(name, email, phone, aadhaar, password) {
        setLoading(true);
        try {
            console.log('[SIGNUP] Starting signup for:', email);

            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: name, phone: phone, aadhaar: aadhaar } }
            });

            console.log('[SIGNUP] Auth response:', JSON.stringify({ authData, authError }, null, 2));

            if (authError) {
                console.error('[SIGNUP] Auth error:', authError);
                setLoading(false);
                return { success: false, error: authError.message };
            }

            // Handle Supabase "fake success" (Email Enumeration Protection)
            if (!authData.user && !authData.session) {
                console.warn('[SIGNUP] Fake success — email likely already exists');
                setLoading(false);
                return { success: false, error: 'An account with this email may already exist. Try a different email.' };
            }

            // If session is null but user exists, Email Confirmation is toggled ON
            if (!authData.session) {
                console.warn('[SIGNUP] No session returned — email confirmation is ON');
                setLoading(false);
                return {
                    success: false,
                    error: 'Supabase requires email confirmation. Go to Supabase Dashboard → Authentication → Providers → Email → Toggle OFF "Confirm email" → Save, then try again.'
                };
            }

            console.log('[SIGNUP] Session obtained, enriching user...');
            const enriched = await enrichUser(authData.session.user);
            console.log('[SIGNUP] Enriched user:', enriched);
            setCurrentUser(enriched);
            setLoading(false);
            return { success: true, user: enriched };
        } catch (err) {
            console.error('[SIGNUP] Unexpected crash:', err);
            setLoading(false);
            return { success: false, error: 'Signup failed: ' + err.message };
        }
    }

    async function logout() {
        await supabase.auth.signOut();
        setCurrentUser(null);
    }

    return (
        <AuthContext.Provider value={{ currentUser, login, signup, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be inside AuthProvider');
    return ctx;
}
