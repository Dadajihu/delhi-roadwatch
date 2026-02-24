/* ──────────────────────────────────────────────
   Delhi RoadWatch — Citizen Home (2026 SaaS Redesign)
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchReports, fetchViolationsByEmail } from '../../data/db';

export default function CitizenHome() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [myReports, setMyReports] = useState([]);
    const [violations, setViolations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setLoading(true);
            const reports = await fetchReports({ citizen_id: currentUser?.user_id });
            setMyReports(reports);
            if (currentUser?.email) {
                const v = await fetchViolationsByEmail(currentUser.email);
                setViolations(v);
            }
            setLoading(false);
        }
        load();
    }, [currentUser]);

    if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>Initializing...</div>;

    const resolvedCount = myReports.filter(r => ['Admin Accepted', 'Police Confirmed', 'Owner Notified'].includes(r.status)).length;
    const pendingCount = myReports.filter(r => ['Submitted', 'AI Processed'].includes(r.status)).length;

    return (
        <div className="mobile-view-container" style={{ maxWidth: '480px', margin: '0 auto' }}>
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-24)',
                paddingTop: 'var(--space-8)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="icon-container" style={{ width: '32px', height: '32px', background: 'var(--info-light)', color: 'var(--info)', fontSize: '14px' }}>📍</div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>Location</div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>New Delhi, DL</div>
                    </div>
                </div>
            </header>

            {/* 2. Greeting Area */}
            <section style={{ marginBottom: 'var(--space-24)' }} className="animate-up">
                <h1 className="text-hero" style={{ marginBottom: '4px' }}>Jai Hind, {currentUser?.name?.split(' ')[0]}</h1>
                <p className="text-meta" style={{ fontSize: '15px' }}>Road safety starts with you. Keep Delhi moving.</p>
            </section>

            {/* 3. Main "Report Violation" Card (Emotion Center) */}
            <section style={{ marginBottom: 'var(--space-24)' }} className="animate-up delay-1">
                <div className="card" style={{
                    background: 'linear-gradient(135deg, var(--bg-card) 0%, #FAFBFF 100%)',
                    padding: 'var(--space-24)',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* Subtle Background Glow */}
                    <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '120px', height: '120px', background: 'var(--primary)', opacity: 0.05, filter: 'blur(40px)', borderRadius: '50%' }}></div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div className="icon-container" style={{ width: '64px', height: '64px', background: 'var(--primary-light)', color: 'var(--primary)', fontSize: '28px', marginBottom: 'var(--space-16)' }}>
                            📸
                        </div>
                        <h2 style={{ marginBottom: '8px' }}>Report Violation</h2>
                        <p className="text-meta" style={{ marginBottom: 'var(--space-24)', maxWidth: '280px' }}>Upload clear photos or videos of traffic rule breakers for AI verification.</p>

                        <button className="btn btn-primary" style={{ width: '100%', padding: '16px' }} onClick={() => navigate('/citizen/report')}>
                            Open Camera & Report
                        </button>
                    </div>
                </div>
            </section>

            {/* 4. Status Stats (Resolved / Pending) */}
            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-16)', marginBottom: 'var(--space-24)' }} className="animate-up delay-2">
                <div className="card" style={{ padding: 'var(--space-16)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="icon-container" style={{ width: '40px', height: '40px', background: 'var(--success-light)', color: 'var(--success)', fontSize: '18px' }}>✓</div>
                    <div>
                        <div style={{ fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>{resolvedCount}</div>
                        <div className="text-meta" style={{ fontSize: '12px', fontWeight: 600 }}>RESOLVED</div>
                    </div>
                </div>
                <div className="card" style={{ padding: 'var(--space-16)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="icon-container" style={{ width: '40px', height: '40px', background: 'var(--warning-light)', color: 'var(--warning)', fontSize: '18px' }}>🕒</div>
                    <div>
                        <div style={{ fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>{pendingCount}</div>
                        <div className="text-meta" style={{ fontSize: '12px', fontWeight: 600 }}>PENDING</div>
                    </div>
                </div>
            </section>

            {/* Active Violations Alert (If any) */}
            {violations.length > 0 && (
                <div className="card" style={{ marginBottom: 'var(--space-24)', background: 'var(--danger-light)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: 'var(--space-16)' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ fontSize: '20px' }}>⚠️</span>
                        <div>
                            <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '14px' }}>Active Penalty Detected</div>
                            <div className="text-meta" style={{ color: 'var(--danger)', opacity: 0.8, fontSize: '13px' }}>You have {violations.length} pending road violations.</div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
