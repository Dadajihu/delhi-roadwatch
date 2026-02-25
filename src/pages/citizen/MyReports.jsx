/* ──────────────────────────────────────────────
   Delhi RoadWatch — My Submissions (2026 SaaS Redesign)
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchReports, fetchAllAiAnalysis } from '../../data/db';

export default function MyReports() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [aiData, setAiData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setLoading(true);
            const r = await fetchReports({ citizen_id: currentUser?.user_id });
            const ai = await fetchAllAiAnalysis();
            setReports(r);
            setAiData(ai);
            setLoading(false);
        }
        load();
    }, [currentUser]);

    if (loading) return <div style={{ padding: 'var(--space-96)', textAlign: 'center', color: 'var(--text-muted)' }}>Retrieving records...</div>;

    return (
        <div className="animate-up">
            <header style={{ marginBottom: 'var(--space-40)', textAlign: 'center' }}>
                <h1 style={{ marginBottom: 'var(--space-16)' }}>Case History</h1>
                <p className="text-body" style={{ color: 'var(--text-secondary)' }}>Track the real-time status and AI verification of your submitted reports.</p>
            </header>

            {reports.length === 0 ? (
                <div className="card text-center" style={{ padding: 'var(--space-96)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="icon-container" style={{ width: '64px', height: '64px', background: 'var(--bg-main)', margin: '0 auto var(--space-24)', fontSize: '24px' }}>📭</div>
                    <h2 style={{ marginBottom: 'var(--space-16)' }}>No reports found</h2>
                    <p className="text-meta" style={{ marginBottom: 'var(--space-24)', textAlign: 'center' }}>Help maintain road discipline by reporting your first violation.</p>
                    <button className="btn btn-primary" onClick={() => navigate(currentUser?.role === 'police' ? '/police/report' : '/citizen/report')}>
                        File New Report
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 'var(--space-16)', paddingBottom: 'var(--space-96)' }}>
                    {reports.map(report => {
                        const ai = aiData.find(a => a.report_id === report.report_id);
                        return (
                            <div key={report.report_id} className="card" style={{ padding: 'var(--space-24)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-24)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-16)' }}>
                                        <div className="icon-container" style={{
                                            width: '44px', height: '44px',
                                            background: 'var(--primary-light)',
                                            color: 'var(--primary)',
                                            fontSize: '20px'
                                        }}>
                                            {report.crime_type.includes('Parking') ? '🅿️' : report.crime_type.includes('Signal') ? '🚦' : '🏎️'}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '16px', lineHeight: 1.2 }}>{report.crime_type}</div>
                                            <div className="text-meta">Reported {new Date(report.submission_time).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <span className={`badge ${report.status.includes('Accepted') || report.status.includes('Confirmed') ? 'badge-success' :
                                        report.status.includes('Rejected') ? 'badge-danger' :
                                            'badge-info'
                                        }`}>
                                        {report.status}
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 'var(--space-24)' }}>
                                    <div>
                                        <div className="text-meta" style={{ fontWeight: 700, marginBottom: '4px' }}>CASE REFERENCE</div>
                                        <div style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{report.report_id}</div>
                                        {(() => {
                                            if (!report.comments) return null;
                                            // Strip out [Location: ...] and [Photo Taken: ...] from citizen view
                                            let cleanText = report.comments;
                                            cleanText = cleanText.replace(/\[Location:\s*([-\d.]+),\s*([-\d.]+)\]/, '');
                                            cleanText = cleanText.replace(/\[Photo Taken:\s*([^\]]+)\]/, '');
                                            cleanText = cleanText.trim();
                                            if (!cleanText) return null;

                                            return (
                                                <div style={{ marginTop: 'var(--space-16)' }}>
                                                    <div className="text-meta" style={{ fontWeight: 700, marginBottom: '4px' }}>{report.reported_by === 'police' ? 'OFFICER REMARKS' : 'CITIZEN REMARKS'}</div>
                                                    <div style={{ fontSize: '14px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{cleanText}"</div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {ai && (
                                        <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: 'var(--space-24)' }}>
                                            <div className="text-meta" style={{ fontWeight: 700, marginBottom: 'var(--space-16)' }}>AI VERDICT</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <div style={{ flex: 1, height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${ai.confidence_score}%`, height: '100%', background: 'var(--primary)' }}></div>
                                                </div>
                                                <span style={{ fontSize: '11px', fontWeight: 800 }}>{ai.confidence_score}%</span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                                                DL DETECTED: {ai.detected_vehicle_number}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
