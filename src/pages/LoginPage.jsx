/* ──────────────────────────────────────────────
   Delhi RoadWatch — Login Portal
   FIXED: Uses useNavigate (no page reload), uses AuthContext.login()
   ────────────────────────────────────────────── */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
            const result = await login(role, identifier, password);

            if (result.success) {
                const dest = result.user?.role === 'citizen' ? '/citizen'
                    : result.user?.role === 'police' ? '/police'
                        : '/admin';
                navigate(dest, { replace: true });
                return;
            }

            setError(result.error || 'Invalid credentials. Please try again.');
        } catch (err) {
            console.error('[LOGIN] Unhandled error:', err);
            setError('Login error: ' + err.message);
        }

        setSubmitting(false);
    };

    const getPlaceholder = () => {
        if (role === 'citizen') return 'Email Address';
        if (role === 'police') return 'Police ID (e.g. POL001)';
        return 'Admin ID (e.g. ADM001)';
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
                gap: 'var(--space-40)',
                textAlign: 'center'
            }}>
                <header>
                    <h1 style={{ fontSize: '42px', fontWeight: 900, letterSpacing: '-0.05em', marginBottom: '12px', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                        ROAD<span style={{ color: 'var(--primary)', fontStyle: 'italic', fontWeight: 500 }}>WATCH</span>.
                    </h1>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.6 }}>Secure access for verified personnel and citizens.</p>
                </header>

                {/* Role Switcher */}
                <div style={{ padding: '5px', display: 'flex', gap: '8px', borderRadius: '16px', background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
                    {['citizen', 'police', 'admin'].map(r => (
                        <button key={r} className="btn role-tab" style={{
                            flex: 1,
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            padding: '11px 12px',
                            minWidth: 0,
                            whiteSpace: 'nowrap',
                            background: role === r ? 'white' : 'transparent',
                            color: role === r ? 'var(--primary)' : 'var(--text-secondary)',
                            boxShadow: role === r ? 'var(--shadow-sm)' : 'none',
                            borderRadius: '11px',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            border: 'none'
                        }} onClick={() => { setRole(r); setIdentifier(''); setPassword(''); setError(''); }}>
                            {r}
                        </button>
                    ))}
                </div>

                {error && (
                    <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', fontSize: '13px', fontWeight: 700, padding: '16px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'center' }}>
                            {getPlaceholder()}
                        </label>
                        <input className="form-input" type={role === 'citizen' ? 'email' : 'text'}
                            placeholder={getPlaceholder()} value={identifier}
                            onChange={e => setIdentifier(e.target.value)} required
                            style={{ padding: '16px', fontSize: '16px', fontWeight: 600, textAlign: 'center', borderRadius: '12px' }} />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'center' }}>Password</label>
                        <input className="form-input" type="password" placeholder="••••••••"
                            value={password} onChange={e => setPassword(e.target.value)} required
                            style={{ padding: '16px', fontSize: '16px', fontWeight: 600, textAlign: 'center', borderRadius: '12px' }} />
                        <div style={{ marginTop: '12px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Forgot credentials?</span>
                        </div>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                        <button type="submit" className="btn btn-primary" disabled={submitting} style={{
                            width: '100%', padding: '18px', fontSize: '15px', fontWeight: 400,
                            letterSpacing: '0.02em', borderRadius: '14px'
                        }}>
                            {submitting ? 'Signing in…' : 'Sign in to portal'}
                        </button>
                    </div>
                </form>

                {role === 'citizen' && (
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        New to RoadWatch? <Link to="/signup" style={{ color: 'var(--primary)', fontWeight: 900, textDecoration: 'none' }}>Create Account</Link>
                    </p>
                )}

                <footer style={{ paddingTop: 'var(--space-32)', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Demo Credentials</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        <div style={{ fontSize: '11px', background: 'var(--bg-main)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px', fontSize: '9px' }}>Citizen</div>
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '10px' }}>arjun@demo.com</div>
                            <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px' }}>citizen123</div>
                        </div>
                        <div style={{ fontSize: '11px', background: 'var(--bg-main)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px', fontSize: '9px' }}>Police</div>
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '10px' }}>POL001</div>
                            <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px' }}>police123</div>
                        </div>
                        <div style={{ fontSize: '11px', background: 'var(--bg-main)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px', fontSize: '9px' }}>Admin</div>
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '10px' }}>ADM001</div>
                            <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px' }}>admin123</div>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
