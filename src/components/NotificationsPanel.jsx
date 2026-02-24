/* ──────────────────────────────────────────────
   Delhi RoadWatch — Notifications Panel (Supabase)
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { fetchNotifications } from '../data/db';

export default function NotificationsPanel() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setLoading(true);
            const data = await fetchNotifications();
            setNotifications(data);
            setLoading(false);
        }
        load();
    }, []);

    if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading notification logs...</div>;

    return (
        <div className="animate-up">
            <header style={{ marginBottom: '40px' }}>
                <h1 style={{ marginBottom: '16px' }}>Dispatch Logs</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Centralized record of all official notifications dispatched to vehicle owners.</p>
            </header>

            {notifications.length === 0 ? (
                <div className="card text-center" style={{ padding: '80px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔕</div>
                    <h3>No dispatches logged</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Official notifications will appear here once cases are confirmed by administration.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '16px', paddingBottom: '80px' }}>
                    {notifications.map(notif => (
                        <div key={notif.notif_id} className="card" style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></div>
                                        <span style={{ fontWeight: 700, fontSize: '14px' }}>DISPATCH SUCCESSFUL</span>
                                    </div>
                                    <div className="text-sm">Sent to <strong>{notif.owner_name}</strong> ({notif.number_plate})</div>
                                </div>
                                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                    {new Date(notif.sent_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                                </div>
                            </div>

                            <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>Message Body</div>
                                {notif.message}
                            </div>

                            <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
                                <div className="text-sm">
                                    <span style={{ color: 'var(--text-muted)' }}>Case ID:</span> <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>#{notif.notif_id.slice(0, 8)}</span>
                                </div>
                                <div className="text-sm">
                                    <span style={{ color: 'var(--text-muted)' }}>Channel:</span> <span style={{ fontWeight: 600 }}>SMS / Push</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
