/* ──────────────────────────────────────────────
   Delhi RoadWatch — Login Portal (Minimalist Redesign)
   ────────────────────────────────────────────── */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
    const [role, setRole] = useState('citizen');
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            // Try AuthContext login first
            const result = await login(role, identifier, password);
            if (result.success) {
                if (role === 'citizen') navigate('/citizen');
                else if (role === 'police') navigate('/police');
                else if (role === 'admin') navigate('/admin');
                setSubmitting(false);
                return;
            }

            // If AuthContext login failed, try direct DB query as backup
            const table = role === 'citizen' ? 'users' : role === 'police' ? 'police' : 'admins';
            const idCol = role === 'citizen' ? 'email' : role === 'police' ? 'police_id' : 'admin_id';

            const { data: directUser, error: dbErr } = await supabase
                .from(table)
                .select('*')
                .eq(idCol, identifier)
                .eq('password_hash', password)
                .single();

            if (directUser) {
                // Force set user through login context workaround
                const user = {
                    ...directUser,
                    role,
                    user_id: directUser.user_id || directUser.police_id || directUser.admin_id
                };
                // Store in sessionStorage so App can pick it up
                sessionStorage.setItem('rw_user', JSON.stringify(user));
                window.location.href = role === 'citizen' ? '/citizen' : role === 'police' ? '/police' : '/admin';
                return;
            }

            setError(result.error || 'Invalid credentials. Please check your email and password.');
        } catch (err) {
            setError('Login failed: ' + err.message);
        }
        setSubmitting(false);
    };

    const getPlaceholder = () => {
        if (role === 'citizen') return 'Email Address';
        if (role === 'police') return 'Police ID';
        return 'Admin ID';
    };

    return (
        <div className="auth-page" style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-main)',
            position: 'relative',
            overflow: 'hidden',
            padding: 'var(--space-24)'
        }}>
            {/* Subtle Background Glows */}
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40vw', height: '40vw', background: 'var(--primary)', opacity: 0.04, filter: 'blur(80px)', borderRadius: '50%', zIndex: 0 }}></div>
            <div style={{ position: 'absolute', bottom: '-5%', right: '-5%', width: '30vw', height: '30vw', background: 'var(--success)', opacity: 0.03, filter: 'blur(80px)', borderRadius: '50%', zIndex: 0 }}></div>

            <div className="auth-card card animate-up" style={{
                zIndex: 1,
                padding: 'calc(var(--space-40) * 1.5)',
                maxWidth: '460px',
                width: '100%',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-40)', // Significant gap between major sections
                textAlign: 'center'
            }}>
                <header>
                    <h1 style={{ fontSize: '42px', fontWeight: 900, letterSpacing: '-0.05em', marginBottom: '12px', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                        ROAD<span style={{ color: 'var(--primary)', fontStyle: 'italic', fontWeight: 500 }}>WATCH</span>.
                    </h1>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.6 }}>Secure access for verified personnel and citizens.</p>
                </header>

                {/* Role Switcher */}
                <div style={{
                    padding: '6px',
                    display: 'flex',
                    gap: '6px',
                    borderRadius: '16px',
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-color)'
                }}>
                    {['citizen', 'police', 'admin'].map(r => (
                        <button
                            key={r}
                            className="btn"
                            style={{
                                flex: 1,
                                fontSize: '12px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                padding: '12px 4px',
                                background: role === r ? 'white' : 'transparent',
                                color: role === r ? 'var(--primary)' : 'var(--text-secondary)',
                                boxShadow: role === r ? 'var(--shadow-sm)' : 'none',
                                borderRadius: '12px',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                border: 'none'
                            }}
                            onClick={() => { setRole(r); setIdentifier(''); setPassword(''); setError(''); }}
                        >
                            {r}
                        </button>
                    ))}
                </div>

                {error && (
                    <div style={{
                        background: 'var(--danger-light)',
                        color: 'var(--danger)',
                        fontSize: '13px',
                        fontWeight: 700,
                        padding: '16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(239, 68, 68, 0.1)'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'center' }}>
                            {getPlaceholder()}
                        </label>
                        <input
                            className="form-input"
                            type={role === 'citizen' ? 'email' : 'text'}
                            placeholder={getPlaceholder()}
                            value={identifier}
                            onChange={e => setIdentifier(e.target.value)}
                            required
                            style={{ padding: '16px', fontSize: '16px', fontWeight: 600, textAlign: 'center', borderRadius: '12px' }}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <label className="form-label" style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 0 }}>Password</label>
                        </div>
                        <input
                            className="form-input"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            style={{ padding: '16px', fontSize: '16px', fontWeight: 600, textAlign: 'center', borderRadius: '12px' }}
                        />
                        <div style={{ marginTop: '12px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Forgot credentials?</span>
                        </div>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                        <button type="submit" className="btn btn-primary" disabled={submitting} style={{
                            width: '100%',
                            padding: '18px',
                            fontSize: '14px',
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            borderRadius: '14px'
                        }}>
                            {submitting ? 'Authenticating...' : 'Sign In to Portal'}
                        </button>
                    </div>
                </form>

                {role === 'citizen' && (
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        New to RoadWatch? <Link to="/signup" style={{ color: 'var(--primary)', fontWeight: 900, textDecoration: 'none' }}>Create Account</Link>
                    </p>
                )}

                {/* Demo Credentials Footer */}
                <footer style={{ paddingTop: 'var(--space-32)', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Demo Environments</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ fontSize: '11px', background: 'var(--bg-main)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '4px', fontSize: '9px' }}>Citizen</div>
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>arjun@demo.com</div>
                        </div>
                        <div style={{ fontSize: '11px', background: 'var(--bg-main)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '4px', fontSize: '9px' }}>Authority</div>
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>POL001 / ADM001</div>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
