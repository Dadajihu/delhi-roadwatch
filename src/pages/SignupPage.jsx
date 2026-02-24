/* ──────────────────────────────────────────────
   Delhi RoadWatch — Signup Page (2026 SaaS Redesign)
   ────────────────────────────────────────────── */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [aadhaar, setAadhaar] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const { signup, loading } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        if (password !== confirm) { setError('Passwords do not match.'); return; }
        if (aadhaar.length !== 12) { setError('Aadhaar must be 12 digits.'); return; }

        const result = await signup(name, email, phone, aadhaar, password);
        if (result.success) {
            if (result.needEmailConfirm) {
                setSuccessMsg('Civic Profile registered securely. Please check your email inbox to verify and activate your identity.');
                setName(''); setEmail(''); setPhone(''); setAadhaar(''); setPassword(''); setConfirm('');
            } else {
                navigate('/citizen');
            }
        } else {
            setError(result.error);
        }
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
            {/* Background Aesthetic */}
            <div style={{ position: 'absolute', top: '-5%', right: '-5%', width: '35vw', height: '35vw', background: 'var(--primary)', opacity: 0.04, filter: 'blur(80px)', borderRadius: '50%' }}></div>

            <div className="auth-card card animate-up" style={{
                maxWidth: '560px',
                width: '100%',
                padding: 'var(--space-40)',
                zIndex: 1
            }}>
                <div className="text-center" style={{ marginBottom: 'var(--space-40)' }}>
                    <div style={{ fontSize: '40px', marginBottom: '16px' }}>📝</div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px' }}>Create Civic Profile</h1>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Secure onboarding for verified Delhi citizens.</p>
                </div>

                {error && (
                    <div className="badge badge-danger" style={{ width: '100%', marginBottom: 'var(--space-24)', padding: '12px', justifyContent: 'center' }}>
                        {error}
                    </div>
                )}
                {successMsg && (
                    <div className="badge badge-success" style={{ width: '100%', marginBottom: 'var(--space-24)', padding: '16px', justifyContent: 'center', textAlign: 'center', lineHeight: 1.5 }}>
                        {successMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
                    <div className="signup-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-24)' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Full Legal Name</label>
                            <input className="form-input" type="text" placeholder="e.g. Rahul Verma" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Email Address</label>
                            <input className="form-input" type="email" placeholder="rahul@nic.in" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                    </div>

                    <div className="signup-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-24)' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Mobile Number</label>
                            <input className="form-input" type="tel" placeholder="+91 98765 00000" value={phone} onChange={e => setPhone(e.target.value)} required />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Aadhaar (12 Digits)</label>
                            <input className="form-input" type="text" placeholder="XXXX XXXX XXXX" value={aadhaar} onChange={e => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))} required />
                        </div>
                    </div>

                    <div className="signup-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-24)' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Create Password</label>
                            <input className="form-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Confirm Password</label>
                            <input className="form-input" type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
                        </div>
                    </div>

                    <div style={{ marginTop: 'var(--space-24)' }}>
                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '16px', fontSize: '15px', fontWeight: 700 }}>
                            {loading ? 'Securing Identity...' : 'Join RoadWatch Ecosystem'}
                        </button>
                    </div>
                </form>

                <p style={{ textAlign: 'center', marginTop: 'var(--space-32)', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Already have a profile? <Link to="/" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>Authenticate Here</Link>
                </p>

                <div className="text-center" style={{ marginTop: 'var(--space-40)', opacity: 0.5 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>POWERED BY DELHI TRAFFIC POLICE 🇮🇳</div>
                </div>
            </div>
        </div>
    );
}


