/* ──────────────────────────────────────────────
   Delhi RoadWatch — Admin Console (Intelligent UI)
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { fetchReports, fetchAllAiAnalysis, updateReportStatus, updateCaseStatus, STATUS } from '../../data/db';
import { notifyOwner } from '../../services/notificationService';

export default function AdminDashboard() {
    const [filter, setFilter] = useState('all');
    const [reports, setReports] = useState([]);
    const [aiData, setAiData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState({});

    const loadData = async () => {
        setLoading(true);
        try {
            const r = await fetchReports();
            const ai = await fetchAllAiAnalysis();
            setReports(r || []);
            setAiData(ai || []);
        } catch (err) {
            console.error("Failed to sync records:", err);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const toggleExpand = (id) => {
        setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const counts = {
        all: reports.length,
        ai: reports.filter(r => r.status === STATUS.AI_PROCESSED).length,
        accepted: reports.filter(r => r.status === STATUS.ADMIN_ACCEPTED || r.status === STATUS.POLICE_CONFIRMED || r.status === STATUS.OWNER_NOTIFIED).length,
        rejected: reports.filter(r => r.status === STATUS.ADMIN_REJECTED).length,
        police: reports.filter(r => r.reported_by === 'police').length,
    };

    const getPriorityScore = (report, ai) => {
        if (report.reported_by === 'police') return 1000; // Police reports highest priority
        if (!ai) return 0;
        // Priority formula: High confidence is good (+), High AI generated (fake) is bad (-)
        let conf = ai.confidence_score || 0;
        let fake = ai.ai_generated_score || 0;
        return conf - (fake * 2); // Penalize fakes heavily
    };

    const filteredAndSorted = reports
        .filter(r => {
            if (filter === 'all') return true;
            if (filter === 'ai_processed') return r.status === STATUS.AI_PROCESSED;
            if (filter === 'accepted') return (r.status === STATUS.ADMIN_ACCEPTED || r.status === STATUS.POLICE_CONFIRMED || r.status === STATUS.OWNER_NOTIFIED);
            if (filter === 'rejected') return r.status === STATUS.ADMIN_REJECTED;
            if (filter === 'police') return r.reported_by === 'police';
            return true;
        })
        .sort((a, b) => {
            const aiA = aiData.find(x => x.report_id === a.report_id);
            const aiB = aiData.find(x => x.report_id === b.report_id);
            // Sort Descending by Priority Score
            return getPriorityScore(b, aiB) - getPriorityScore(a, aiA);
        });

    const handleAccept = async (reportId) => {
        await updateReportStatus(reportId, STATUS.ADMIN_ACCEPTED);
        await updateCaseStatus(reportId, { admin_status: 'accepted' });
        await loadData();
    };

    const handleReject = async (reportId) => {
        await updateReportStatus(reportId, STATUS.ADMIN_REJECTED);
        await updateCaseStatus(reportId, { admin_status: 'rejected' });
        await loadData();
    };

    const handleConfirmAndNotify = async (reportId) => {
        const report = reports.find(r => r.report_id === reportId);
        if (!report) return;
        await updateReportStatus(reportId, STATUS.POLICE_CONFIRMED);
        await updateCaseStatus(reportId, { police_status: 'confirmed' });
        const plate = report.number_plate || aiData.find(a => a.report_id === reportId)?.detected_vehicle_number;
        if (plate && plate !== 'PENDING') {
            await notifyOwner(reportId, plate, report.crime_type);
        }
        await loadData();
    };

    if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>Syncing Intelligence Cloud...</div>;

    return (
        <div className="animate-up" style={{ width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
            <header style={{ marginBottom: 'var(--space-24)', padding: '0 var(--space-8)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-0.04em' }}>Command Center</h1>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></div> AI Verified</span>
                    </div>
                </div>
                <p className="text-body" style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, marginTop: '4px' }}>
                    Cases are intelligently ranked by AI Confidence minus deepfake probability.
                </p>
            </header>

            {/* Filter Dropdown */}
            <div style={{
                padding: '16px var(--space-8)',
                marginBottom: 'var(--space-24)',
                display: 'flex',
                justifyContent: 'center'
            }}>
                <div style={{ position: 'relative', width: '280px' }}>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        style={{
                            width: '100%',
                            appearance: 'none',
                            padding: '16px 24px',
                            fontSize: '14px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            background: 'white',
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px',
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)',
                            outline: 'none',
                            transition: 'all 0.2s ease',
                            textAlign: 'center',
                            textAlignLast: 'center'
                        }}
                    >
                        <option value="all">All Cases ({counts.all})</option>
                        <option value="ai_processed">Needs Review ({counts.ai})</option>
                        <option value="accepted">Accepted ({counts.accepted})</option>
                        <option value="rejected">Rejected ({counts.rejected})</option>
                    </select>
                    <div style={{
                        position: 'absolute',
                        right: '24px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        color: 'var(--primary)',
                        fontSize: '10px'
                    }}>
                        ▼
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)', padding: '0 var(--space-8)', paddingBottom: 'var(--space-96)' }}>
                {filteredAndSorted.length === 0 ? (
                    <div style={{
                        padding: '96px 24px',
                        background: 'white',
                        borderRadius: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ fontSize: '56px', marginBottom: '16px', opacity: 0.8 }}>📭</div>
                        <h3 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>Queue is clear</h3>
                        <p style={{ marginTop: '8px', fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 600 }}>No cases match the current filter criteria.</p>
                    </div>
                ) : (
                    filteredAndSorted.map((report, index) => {
                        const ai = aiData.find(a => a.report_id === report.report_id);
                        const isPoliceReport = report.reported_by === 'police';
                        const isExpanded = !!expandedIds[report.report_id];
                        const priorityScore = getPriorityScore(report, ai);

                        // Top level indicators
                        let rankColor = 'var(--text-muted)';
                        let rankLabel = 'Standard';
                        if (index < 3 && priorityScore > 50) {
                            rankColor = 'var(--warning)';
                            rankLabel = 'High Priority';
                        }
                        if (isPoliceReport) {
                            rankColor = 'var(--info)';
                            rankLabel = 'Official';
                        }
                        if (ai?.ai_generated_score > 60) {
                            rankColor = 'var(--danger)';
                            rankLabel = 'Potential Fake';
                        }

                        return (
                            <div key={report.report_id} className="card" style={{
                                padding: 0,
                                borderRadius: '20px',
                                background: 'white',
                                overflow: 'hidden',
                                border: `1px solid ${isExpanded ? 'var(--primary-light)' : 'var(--border-color)'}`,
                                transition: 'all 0.3s ease'
                            }}>
                                {/* Compact Top Bar (Always Visible) */}
                                <div
                                    onClick={() => toggleExpand(report.report_id)}
                                    style={{
                                        padding: 'var(--space-20) var(--space-24)',
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(80px, 1fr) 2fr 1fr 1fr auto',
                                        alignItems: 'center',
                                        gap: '16px',
                                        cursor: 'pointer',
                                        background: isExpanded ? 'var(--bg-main)' : 'white'
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '10px', fontWeight: 900, color: rankColor, textTransform: 'uppercase' }}>{rankLabel}</span>
                                        <span style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: '14px' }}>#{report.report_id.slice(-6)}</span>
                                    </div>

                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>{report.crime_type}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            {new Date(report.submission_time).toLocaleDateString()} at {new Date(report.submission_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</span>
                                        <span className={`badge ${report.status.includes('Accepted') || report.status.includes('Confirmed') ? 'badge-success' :
                                            report.status.includes('Rejected') ? 'badge-danger' :
                                                report.status.includes('Processed') ? 'badge-warning' : 'badge-info'
                                            }`} style={{ alignSelf: 'flex-start', fontSize: '10px' }}>
                                            {report.status.toUpperCase()}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>AI Score</span>
                                        <span style={{ fontWeight: 800, fontSize: '14px', color: ai ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                            {isPoliceReport ? 'N/A' : ai ? `${ai.confidence_score}%` : 'Pending'}
                                        </span>
                                    </div>

                                    <div style={{ color: 'var(--primary)', fontWeight: 900, fontSize: '20px', paddingLeft: '16px' }}>
                                        {isExpanded ? '−' : '+'}
                                    </div>
                                </div>

                                {/* Expanded Content View */}
                                {isExpanded && (
                                    <div style={{ padding: 'var(--space-24)', borderTop: '1px solid var(--border-color)', animation: 'slideUp 0.3s ease forwards' }}>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 'var(--space-24)' }}>
                                            {/* Left Col: Details & AI */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
                                                <div>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Reporter Comments</div>
                                                    <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6, background: 'var(--bg-main)', padding: '16px', borderRadius: '12px' }}>
                                                        {report.comments || 'No additional context provided by citizen.'}
                                                    </div>
                                                </div>

                                                {!isPoliceReport && ai ? (
                                                    <div style={{ background: 'var(--primary-light)', borderRadius: '16px', padding: 'var(--space-24)', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-16)' }}>
                                                            <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <div style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></div>
                                                                AI VERIFICATION LAYER
                                                            </div>
                                                            <div style={{
                                                                fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '6px',
                                                                background: (ai.ai_generated_score || 0) > 50 ? 'var(--danger)' : 'var(--success)', color: 'white'
                                                            }}>
                                                                DEEPFAKE PROB: {ai.ai_generated_score || 0}%
                                                            </div>
                                                        </div>

                                                        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                                                            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px' }}>DETECTED PLATE</div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontWeight: 900, fontSize: '24px', letterSpacing: '0.1em', fontFamily: 'monospace' }}>{ai.detected_vehicle_number}</div>
                                                                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--success)' }}>{ai.confidence_score}% Match</div>
                                                            </div>
                                                        </div>

                                                        {/* AI Verdict Badge */}
                                                        {(() => {
                                                            const summary = ai.ai_summary || '';
                                                            const verdictMatch = summary.match(/^\[([A-Z_]+)\]\s*/);
                                                            const verdict = verdictMatch ? verdictMatch[1] : null;
                                                            const comments = verdictMatch ? summary.replace(verdictMatch[0], '') : summary;
                                                            const verdictColors = {
                                                                'CONFIRMED_VIOLATION': { bg: 'var(--danger)', text: 'white' },
                                                                'PROBABLE_VIOLATION': { bg: 'var(--warning)', text: 'white' },
                                                                'INSUFFICIENT_EVIDENCE': { bg: '#94A3B8', text: 'white' },
                                                                'NO_VIOLATION_DETECTED': { bg: 'var(--success)', text: 'white' },
                                                                'ANALYSIS_COMPLETE': { bg: 'var(--info)', text: 'white' }
                                                            };
                                                            const vc = verdictColors[verdict] || { bg: 'var(--info)', text: 'white' };
                                                            return (
                                                                <div style={{ marginBottom: '16px' }}>
                                                                    {verdict && (
                                                                        <div style={{
                                                                            display: 'inline-block', fontSize: '10px', fontWeight: 900,
                                                                            padding: '5px 12px', borderRadius: '8px', marginBottom: '12px',
                                                                            background: vc.bg, color: vc.text, letterSpacing: '0.05em'
                                                                        }}>
                                                                            {verdict.replace(/_/g, ' ')}
                                                                        </div>
                                                                    )}
                                                                    <div style={{
                                                                        fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500,
                                                                        lineHeight: 1.7, background: 'white', padding: '16px',
                                                                        borderRadius: '12px', borderLeft: `3px solid ${vc.bg}`
                                                                    }}>
                                                                        {comments}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Vahaan Info Section */}
                                                        <div style={{ borderTop: '1px dashed rgba(37, 99, 235, 0.2)', paddingTop: '16px' }}>
                                                            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '8px' }}>VAHAAN REGISTRY MATCH</div>
                                                            {ai.vahaan_status === 'not there in wahan' ? (
                                                                <div style={{ color: 'var(--danger)', fontSize: '13px', fontWeight: 800 }}>⚠️ NOT FOUND IN NATIONAL REGISTRY</div>
                                                            ) : (
                                                                <div style={{ background: 'white', padding: '16px', borderRadius: '12px', fontSize: '13px' }}>
                                                                    {(() => {
                                                                        try {
                                                                            const v = JSON.parse(ai.vahaan_status);
                                                                            return (
                                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                                                    <div><span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Owner</span><strong style={{ display: 'block' }}>{v.owner_name}</strong></div>
                                                                                    <div><span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Vehicle</span><strong style={{ display: 'block' }}>{v.vehicle_make} {v.vehicle_model}</strong></div>
                                                                                    <div><span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Color</span><strong style={{ display: 'block' }}>{v.vehicle_color}</strong></div>
                                                                                    <div><span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Insurance</span><strong style={{ display: 'block' }}>{v.insurance_valid_till}</strong></div>
                                                                                </div>
                                                                            );
                                                                        } catch (e) {
                                                                            return <span style={{ color: 'var(--text-secondary)' }}>{ai.vahaan_status}</span>;
                                                                        }
                                                                    })()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : isPoliceReport && (
                                                    <div style={{ background: 'var(--success-light)', borderRadius: '16px', padding: '24px' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--success)', marginBottom: '8px' }}>OFFICIAL VERDICT</div>
                                                        <div style={{ fontWeight: 900, fontFamily: 'monospace', fontSize: '24px' }}>{report.number_plate}</div>
                                                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '8px' }}>Submitted directly by authorized personnel.</div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Col: Media & Actions */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-20)', borderLeft: '1px solid var(--border-color)', paddingLeft: 'var(--space-24)' }}>
                                                <div>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Digital Evidence</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                                                        {(report.media_urls || []).map((m, idx) => (
                                                            <div key={idx} style={{ aspectRatio: '1/1', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <span style={{ fontSize: '32px' }}>{m.endsWith('.mp4') ? '🎬' : '🖼️'}</span>
                                                            </div>
                                                        ))}
                                                        {(!report.media_urls || report.media_urls.length === 0) && (
                                                            <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>No media provided.</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ marginTop: 'auto' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Enforcement Actions</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                        {report.status === STATUS.AI_PROCESSED && (
                                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                                <button className="btn btn-secondary" style={{ flex: 1, padding: '16px' }} onClick={() => handleReject(report.report_id)}>Reject</button>
                                                                <button className="btn btn-primary" style={{ flex: 2, padding: '16px' }} onClick={() => handleAccept(report.report_id)}>Verify & Accept</button>
                                                            </div>
                                                        )}

                                                        {report.status === STATUS.ADMIN_ACCEPTED && (
                                                            <button className="btn btn-primary" style={{ width: '100%', background: 'var(--success)', padding: '16px' }} onClick={() => handleConfirmAndNotify(report.report_id)}>
                                                                Dispatch E-Challan Notification
                                                            </button>
                                                        )}

                                                        {(report.status === STATUS.POLICE_CONFIRMED || report.status === STATUS.OWNER_NOTIFIED) && (
                                                            <div style={{ color: 'var(--success)', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '16px', background: 'var(--success-light)', borderRadius: '12px' }}>
                                                                ✓ CASE COMPLETED & NOTIFIED
                                                            </div>
                                                        )}

                                                        {(report.status === STATUS.ADMIN_REJECTED) && (
                                                            <div style={{ color: 'var(--danger)', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '16px', background: 'var(--danger-light)', borderRadius: '12px' }}>
                                                                ✕ CASE DISMISSED
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

