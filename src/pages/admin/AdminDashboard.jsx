/* ──────────────────────────────────────────────
   Delhi RoadWatch — Admin Command Center (Redesigned 2026)
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { fetchReports, fetchAllAiAnalysis, updateReportStatus, updateCaseStatus, deleteReport, STATUS } from '../../data/db';
import { notifyOwner } from '../../services/notificationService';
import { textToSpeech, translateText, playBase64Audio, SUPPORTED_LANGUAGES } from '../../services/sarvamService';

/* ── Helpers ── */

// Parse "[Location: lat, lng]" out of a comment string
function parseLocation(comment = '') {
    const match = comment.match(/\[Location:\s*([-\d.]+),\s*([-\d.]+)\]/);
    if (!match) return { lat: null, lng: null, text: comment.trim() };
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const text = comment.replace(match[0], '').trim();
    return { lat, lng, text };
}

function MapsLink({ lat, lng }) {
    if (!lat || !lng) return null;
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontSize: '12px', fontWeight: 800, color: 'var(--primary)',
                textDecoration: 'none', background: 'var(--primary-light)',
                padding: '6px 12px', borderRadius: '8px',
                border: '1px solid rgba(37,99,235,0.15)',
                transition: 'all 0.2s ease', marginTop: '8px',
                cursor: 'pointer'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--primary-light)'; e.currentTarget.style.color = 'var(--primary)'; }}
        >
            <span>📍</span>
            <span>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
            <span style={{ opacity: 0.7 }}>→ Maps</span>
        </a>
    );
}

function ScoreBar({ value, color, label, max = 100 }) {
    const pct = Math.min(100, Math.max(0, value || 0));
    return (
        <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 900, color }}>{pct}%</span>
            </div>
            <div style={{ height: '5px', background: 'var(--border-color)', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{
                    height: '100%', width: `${pct}%`, background: color,
                    borderRadius: '99px', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)'
                }} />
            </div>
        </div>
    );
}

const VERDICT_META = {
    'CONFIRMED_VIOLATION': { bg: '#EF4444', text: 'white', label: 'Confirmed Violation' },
    'PROBABLE_VIOLATION': { bg: '#F59E0B', text: 'white', label: 'Probable Violation' },
    'INSUFFICIENT_EVIDENCE': { bg: '#94A3B8', text: 'white', label: 'Insufficient Evidence' },
    'NO_VIOLATION_DETECTED': { bg: '#10B981', text: 'white', label: 'No Violation' },
    'ANALYSIS_COMPLETE': { bg: '#6366F1', text: 'white', label: 'Analysis Complete' },
};

function parseAiSummary(summary = '') {
    const match = summary.match(/^\[([A-Z_]+)\]\s*/);
    if (!match) return { verdict: null, meta: null, comments: summary };
    const verdict = match[1];
    const meta = VERDICT_META[verdict] || { bg: '#6366F1', text: 'white', label: verdict.replace(/_/g, ' ') };
    return { verdict, meta, comments: summary.replace(match[0], '').trim() };
}

/* ── Filter tabs config ── */
const FILTER_TABS = [
    { key: 'all', label: 'All Cases', },
    { key: 'needs_review', label: 'Needs Review', },
    { key: 'accepted', label: 'Accepted', },
    { key: 'rejected', label: 'Rejected', },
];

/* ── Main Component ── */
export default function AdminDashboard() {
    const [filter, setFilter] = useState('all');
    const [reports, setReports] = useState([]);
    const [aiData, setAiData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState({});
    const [actionLoading, setActionLoading] = useState({});
    const [previewMedia, setPreviewMedia] = useState(null);

    // Feature states
    const [playingId, setPlayingId] = useState(null);
    const [translatingId, setTranslatingId] = useState(null);
    const [translations, setTranslations] = useState({}); // { reportId: { text, lang, srcLang, isOriginal } }
    const [srcLangs, setSrcLangs] = useState({}); // { reportId: langCode } — source language per report

    const loadData = async () => {
        setLoading(true);
        try {
            const [r, ai] = await Promise.all([fetchReports(), fetchAllAiAnalysis()]);
            setReports(r || []);
            setAiData(ai || []);
        } catch (err) {
            console.error('Failed to sync records:', err);
        }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const toggleExpand = (id) => setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));

    // ── Feature 2: TTS ───────────────────────────────────────────────────────
    const handleReadAloud = async (report, ai) => {
        if (playingId === report.report_id) return;
        setPlayingId(report.report_id);

        try {
            const summaryText = `Report summary for code ${report.report_id.slice(-6)}. Violation: ${report.crime_type}. Status: ${report.status}. AI priority score: ${ai ? getPriorityScore(report, ai) : 'Standard'}. ${report.comments ? `Citizen remarks: ${report.comments}` : ''}`;

            const { audioBase64 } = await textToSpeech(summaryText, 'en-IN');
            const audio = playBase64Audio(audioBase64);

            audio.onended = () => setPlayingId(null);
            audio.onerror = () => setPlayingId(null);
        } catch (err) {
            console.error("TTS Error:", err);
            alert("Audio playback failed: " + err.message);
            setPlayingId(null);
        }
    };

    // ── Feature 3: Translation ───────────────────────────────────────────────
    const handleTranslate = async (reportId, text, targetLang) => {
        if (!text) return;
        const srcLang = srcLangs[reportId] || 'en-IN';
        setTranslatingId(reportId);
        try {
            const { translated_text } = await translateText(text, srcLang, targetLang);
            setTranslations(prev => ({
                ...prev,
                [reportId]: { text: translated_text, lang: targetLang, srcLang, isOriginal: false }
            }));
        } catch (err) {
            console.error("Translation Error:", err);
            alert("Translation failed: " + err.message);
        } finally {
            setTranslatingId(null);
        }
    };

    const toggleOriginal = (reportId) => {
        setTranslations(prev => ({
            ...prev,
            [reportId]: { ...prev[reportId], isOriginal: !prev[reportId].isOriginal }
        }));
    };

    const counts = {
        all: reports.length,
        // Needs Review = Submitted (waiting AI) OR AI Processed (waiting admin)
        needs_review: reports.filter(r => [STATUS.SUBMITTED, STATUS.AI_PROCESSED].includes(r.status)).length,
        accepted: reports.filter(r => [STATUS.ADMIN_ACCEPTED, STATUS.POLICE_CONFIRMED, STATUS.OWNER_NOTIFIED].includes(r.status)).length,
        rejected: reports.filter(r => r.status === STATUS.ADMIN_REJECTED).length,
    };

    const getPriorityScore = (report, ai) => {
        if (report.reported_by === 'police') return 1000;
        if (!ai) return 0;
        return (ai.confidence_score || 0) - ((ai.ai_generated_score || 0) * 2);
    };

    const filteredAndSorted = reports
        .filter(r => {
            if (filter === 'all') return true;
            // Needs Review: both Submitted (AI pending) and AI Processed (admin pending)
            if (filter === 'needs_review') return [STATUS.SUBMITTED, STATUS.AI_PROCESSED].includes(r.status);
            if (filter === 'accepted') return [STATUS.ADMIN_ACCEPTED, STATUS.POLICE_CONFIRMED, STATUS.OWNER_NOTIFIED].includes(r.status);
            if (filter === 'rejected') return r.status === STATUS.ADMIN_REJECTED;
            return true;
        })
        .sort((a, b) => {
            const aiA = aiData.find(x => x.report_id === a.report_id);
            const aiB = aiData.find(x => x.report_id === b.report_id);
            // Submitted with no AI data sorts to top (most urgent)
            const scoreA = a.status === STATUS.SUBMITTED && !aiA ? 500 : getPriorityScore(a, aiA);
            const scoreB = b.status === STATUS.SUBMITTED && !aiB ? 500 : getPriorityScore(b, aiB);
            return scoreB - scoreA;
        });

    const withAction = async (reportId, fn) => {
        setActionLoading(prev => ({ ...prev, [reportId]: true }));
        await fn();
        await loadData();
        setActionLoading(prev => ({ ...prev, [reportId]: false }));
    };

    const handleAccept = (id) => withAction(id, async () => {
        await updateReportStatus(id, STATUS.ADMIN_ACCEPTED);
        await updateCaseStatus(id, { admin_status: 'accepted' });
    });

    const handleReject = (id) => withAction(id, async () => {
        await updateReportStatus(id, STATUS.ADMIN_REJECTED);
        await updateCaseStatus(id, { admin_status: 'rejected' });
    });

    const handleConfirmAndNotify = (id) => withAction(id, async () => {
        const report = reports.find(r => r.report_id === id);
        if (!report) return;
        await updateReportStatus(id, STATUS.POLICE_CONFIRMED);
        await updateCaseStatus(id, { police_status: 'confirmed' });
        const plate = report.number_plate || aiData.find(a => a.report_id === id)?.detected_vehicle_number;
        if (plate && plate !== 'PENDING' && plate !== 'REVIEW REQUIRED') await notifyOwner(id, plate, report.crime_type);
    });

    const handleDelete = (id) => {
        if (!window.confirm('Permanently delete this report and all associated data? This cannot be undone.')) return;
        withAction(id, async () => {
            await deleteReport(id);
            // Collapse if expanded
            setExpandedIds(prev => { const n = { ...prev }; delete n[id]; return n; });
        });
    };

    if (loading) return (
        <div style={{ padding: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--primary-light)', borderTopColor: 'var(--primary)', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '14px' }}>Syncing Intelligence Cloud…</div>
        </div>
    );

    return (
        <div className="animate-up" style={{ width: '100%', maxWidth: '1080px', margin: '0 auto' }}>
            {/* ── Header ── */}
            <header className="admin-page-header">
                <h1 style={{ fontSize: '30px', fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>Command Center</h1>
                <p style={{ fontWeight: 500 }}>Cases are ranked by AI confidence minus deepfake probability</p>
                <div className="admin-header-status" style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '7px 16px', display: 'inline-flex' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Engine Live</span>
                </div>
            </header>

            {/* ── Filter Tab Pills ── */}
            <div className="admin-filter-row">
                {FILTER_TABS.map(tab => {
                    const isActive = filter === tab.key;
                    const count = counts[tab.key] ?? 0;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            className="admin-filter-tab"
                            style={{
                                background: isActive ? 'var(--primary)' : 'transparent',
                                color: isActive ? 'white' : 'var(--text-secondary)',
                                boxShadow: isActive ? '0 2px 12px rgba(37,99,235,0.3)' : 'none',
                            }}
                        >
                            <span>{tab.label}</span>
                            <span style={{
                                fontSize: '10px', fontWeight: 900,
                                background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--bg-main)',
                                color: isActive ? 'white' : 'var(--text-muted)',
                                padding: '2px 7px', borderRadius: '99px',
                                border: isActive ? 'none' : '1px solid var(--border-color)'
                            }}>{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── Case List ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '80px' }}>
                {filteredAndSorted.length === 0 ? (
                    <div style={{ padding: '100px 24px', background: 'white', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '52px', marginBottom: '12px' }}>📭</div>
                        <h3 style={{ fontSize: '20px', fontWeight: 900 }}>Queue is clear</h3>
                        <p style={{ marginTop: '6px', color: 'var(--text-secondary)', fontWeight: 500 }}>No cases match this filter.</p>
                    </div>
                ) : filteredAndSorted.map((report, index) => {
                    const fallbackAi = {
                        confidence_score: 0,
                        ai_generated_score: 0,
                        ai_summary: '[INSUFFICIENT_EVIDENCE] AI Analysis could not determine if a violation occurred due to insufficient visual data or the analysis is still pending. Manual review is required.',
                        detected_vehicle_number: report.number_plate || 'UNKNOWN',
                        vahaan_status: null
                    };

                    const ai = aiData.find(a => a.report_id === report.report_id) || fallbackAi;
                    const isPolice = report.reported_by === 'police';
                    const isExpanded = !!expandedIds[report.report_id];
                    const isActing = !!actionLoading[report.report_id];
                    const priorityScore = getPriorityScore(report, ai);

                    // Badge
                    let rankColor = '#94A3B8', rankLabel = 'Standard', rankBg = 'rgba(148,163,184,0.1)';
                    if (index < 3 && priorityScore > 50) { rankColor = '#F59E0B'; rankLabel = 'High Priority'; rankBg = 'rgba(245,158,11,0.08)'; }
                    if (isPolice) { rankColor = '#6366F1'; rankLabel = 'Official'; rankBg = 'rgba(99,102,241,0.08)'; }
                    if ((ai?.ai_generated_score || 0) > 60) { rankColor = '#EF4444'; rankLabel = 'Suspect Fake'; rankBg = 'rgba(239,68,68,0.08)'; }

                    const statusColor = report.status.includes('Accepted') || report.status.includes('Confirmed') ? '#10B981'
                        : report.status.includes('Rejected') ? '#EF4444'
                            : report.status.includes('Processed') ? '#F59E0B' : '#6366F1';

                    const confScore = ai?.confidence_score ?? null;
                    const fakeScore = ai?.ai_generated_score ?? null;

                    const { lat, lng, text: cleanComment } = parseLocation(report.comments || '');
                    const { verdict, meta, comments: aiComments } = parseAiSummary(ai?.ai_summary || '');

                    return (
                        <div key={report.report_id} style={{
                            background: 'white', borderRadius: '20px', overflow: 'hidden',
                            border: `1px solid ${isExpanded ? 'rgba(37,99,235,0.3)' : 'var(--border-color)'}`,
                            boxShadow: isExpanded ? '0 8px 32px rgba(37,99,235,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
                            transition: 'all 0.3s ease'
                        }}>
                            {/* ── Compact Header Bar ── */}
                            <div
                                onClick={() => toggleExpand(report.report_id)}
                                style={{
                                    padding: '18px 22px',
                                    cursor: 'pointer',
                                    background: isExpanded ? '#FAFBFF' : 'white',
                                    transition: 'background 0.2s ease'
                                }}
                            >
                                {/* Row 1: ID + Crime + Status + Toggle */}
                                <div className="admin-card-header">
                                    {/* ID + Rank */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{
                                            fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em',
                                            color: rankColor, background: rankBg, padding: '3px 8px', borderRadius: '6px',
                                            display: 'inline-block', alignSelf: 'flex-start'
                                        }}>{rankLabel}</span>
                                        <span style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                            #{report.report_id.slice(-6).toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Crime + Time */}
                                    <div className="admin-card-crime">
                                        <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>{report.crime_type}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
                                            {new Date(report.submission_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            {' at '}
                                            {new Date(report.submission_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>

                                    {/* Status badge */}
                                    <div className="admin-card-status" style={{
                                        fontSize: '10px', fontWeight: 900, padding: '5px 10px', borderRadius: '8px',
                                        background: `${statusColor}18`, color: statusColor,
                                        textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                                        alignSelf: 'flex-start'
                                    }}>
                                        {report.status}
                                    </div>

                                    {/* Expand toggle */}
                                    <div className="admin-card-toggle" style={{
                                        width: '28px', height: '28px', borderRadius: '8px',
                                        background: isExpanded ? 'var(--primary)' : 'var(--bg-main)',
                                        color: isExpanded ? 'white' : 'var(--text-secondary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '14px', fontWeight: 900, border: '1px solid var(--border-color)',
                                        transition: 'all 0.2s ease', flexShrink: 0
                                    }}>
                                        {isExpanded ? '−' : '+'}
                                    </div>
                                </div>

                                {/* Row 2: Score bars (always visible) */}
                                <div className="admin-score-bars" style={{ paddingTop: '4px' }}>
                                    {isPolice ? (
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#6366F1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>🔵</span> Official Police Report — No AI scan required
                                        </div>
                                    ) : (
                                        <>
                                            <ScoreBar
                                                value={confScore}
                                                color={confScore === null ? '#94A3B8' : confScore > 70 ? '#10B981' : confScore > 40 ? '#F59E0B' : '#EF4444'}
                                                label="AI Confidence"
                                            />
                                            <ScoreBar
                                                value={fakeScore}
                                                color={fakeScore === null ? '#94A3B8' : fakeScore > 60 ? '#EF4444' : fakeScore > 30 ? '#F59E0B' : '#10B981'}
                                                label="Deepfake Risk"
                                            />
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ── Expanded Detail Panel ── */}
                            {isExpanded && (
                                <div style={{ borderTop: '1px solid var(--border-color)', padding: '24px', background: '#FAFBFF' }}>
                                    <div className="admin-expanded-grid">

                                        {/* ── Left Column ── */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                                            {/* User Comment + Location */}
                                            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid var(--border-color)' }}>
                                                <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span>💬</span> Citizen Report
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {/* TTS Button */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleReadAloud(report, ai); }}
                                                            title="Read Aloud"
                                                            className="btn-icon"
                                                            style={{
                                                                background: playingId === report.report_id ? 'var(--primary)' : 'var(--primary-light)',
                                                                color: playingId === report.report_id ? 'white' : 'var(--primary)',
                                                                padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer'
                                                            }}
                                                        >
                                                            {playingId === report.report_id ? '⏹' : '🔊'}
                                                        </button>

                                                        {/* Translate Dropdown */}
                                                        <div style={{ position: 'relative' }}>
                                                            <button
                                                                title="Translate"
                                                                className="btn-icon"
                                                                style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                                                                onClick={(e) => { e.stopPropagation(); }}
                                                            >
                                                                🌐
                                                            </button>
                                                            <div className="translate-popover">
                                                                {/* Source language selector */}
                                                                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', marginBottom: '4px' }}>
                                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Report Written In</div>
                                                                    <select
                                                                        value={srcLangs[report.report_id] || 'en-IN'}
                                                                        onChange={(e) => { e.stopPropagation(); setSrcLangs(prev => ({ ...prev, [report.report_id]: e.target.value })); }}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'white' }}
                                                                    >
                                                                        {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                                                                            <option key={code} value={code}>{name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div style={{ padding: '4px 0', fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', paddingLeft: '12px', marginBottom: '2px' }}>Translate To</div>
                                                                {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                                                                    <div key={code} onClick={() => handleTranslate(report.report_id, report.comments, code)} style={{ padding: '6px 12px', cursor: 'pointer' }}>
                                                                        {name}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {translatingId === report.report_id ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 600 }}>
                                                        <div className="sarvam-spinner-small"></div> Translating...
                                                    </div>
                                                ) : (
                                                    <>
                                                        <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 500, margin: 0 }}>
                                                            {translation && !translation.isOriginal ? translation.text : (cleanComment || 'No written comment provided.')}
                                                        </p>
                                                        {translation && (
                                                            <button
                                                                onClick={() => toggleOriginal(report.report_id)}
                                                                style={{
                                                                    display: 'block', marginTop: '8px', fontSize: '11px', fontWeight: 800,
                                                                    color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer'
                                                                }}
                                                            >
                                                                {translation.isOriginal ? `Show ${SUPPORTED_LANGUAGES[translation.lang]} Translation` : 'Show Original (English)'}
                                                            </button>
                                                        )}
                                                    </>
                                                )}

                                                {(lat && lng) && (
                                                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border-color)' }}>
                                                        <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
                                                            📍 Incident Location
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', background: 'var(--bg-main)', padding: '4px 10px', borderRadius: '6px' }}>
                                                                {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
                                                            </span>
                                                            <MapsLink lat={lat} lng={lng} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* AI Analysis Panel */}
                                            {!isPolice && ai ? (
                                                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(37,99,235,0.15)', overflow: 'hidden' }}>
                                                    {/* AI Header */}
                                                    <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg, #EFF6FF, #F0F4FF)', borderBottom: '1px solid rgba(37,99,235,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <div style={{ width: '7px', height: '7px', background: 'var(--primary)', borderRadius: '50%', boxShadow: '0 0 5px var(--primary)' }} />
                                                            AI VERIFICATION LAYER
                                                        </div>
                                                        {verdict && (
                                                            <div style={{ fontSize: '10px', fontWeight: 900, padding: '4px 10px', borderRadius: '7px', background: meta.bg, color: meta.text, letterSpacing: '0.04em' }}>
                                                                {meta.label}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                        {/* Score Cards Row */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                            <div style={{ background: 'var(--bg-main)', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>AI Confidence</div>
                                                                <div style={{
                                                                    fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em',
                                                                    color: (ai.confidence_score || 0) > 70 ? '#10B981' : (ai.confidence_score || 0) > 40 ? '#F59E0B' : '#EF4444'
                                                                }}>
                                                                    {ai.confidence_score ?? '—'}
                                                                    <span style={{ fontSize: '14px', fontWeight: 700 }}>%</span>
                                                                </div>
                                                            </div>
                                                            <div style={{ background: 'var(--bg-main)', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Deepfake Risk</div>
                                                                <div style={{
                                                                    fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em',
                                                                    color: (ai.ai_generated_score || 0) > 60 ? '#EF4444' : (ai.ai_generated_score || 0) > 30 ? '#F59E0B' : '#10B981'
                                                                }}>
                                                                    {ai.ai_generated_score ?? '—'}
                                                                    <span style={{ fontSize: '14px', fontWeight: 700 }}>%</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Detected Plate */}
                                                        {ai.detected_vehicle_number && (
                                                            <div style={{ background: '#F8FAFF', border: '1px solid rgba(37,99,235,0.12)', borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Detected Plate</div>
                                                                    <div style={{ fontWeight: 900, fontSize: '22px', letterSpacing: '0.12em', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                                                                        {ai.detected_vehicle_number}
                                                                    </div>
                                                                </div>
                                                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '6px 12px', borderRadius: '8px' }}>
                                                                    {ai.confidence_score}% match
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* AI Comments */}
                                                        {aiComments && (
                                                            <div style={{
                                                                fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500,
                                                                lineHeight: 1.7, background: 'var(--bg-main)', padding: '14px',
                                                                borderRadius: '12px', borderLeft: `3px solid ${meta?.bg || 'var(--primary)'}`
                                                            }}>
                                                                {aiComments}
                                                            </div>
                                                        )}

                                                        {/* Vahaan */}
                                                        {ai.vahaan_status && (
                                                            <div style={{ borderTop: '1px dashed rgba(37,99,235,0.15)', paddingTop: '14px' }}>
                                                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                                                                    🚗 Vahaan Registry
                                                                </div>
                                                                {ai.vahaan_status === 'not there in wahan' ? (
                                                                    <div style={{ color: '#EF4444', fontSize: '13px', fontWeight: 800, background: 'rgba(239,68,68,0.06)', padding: '10px 14px', borderRadius: '10px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                        <span>⚠️</span> NOT FOUND in national registry
                                                                    </div>
                                                                ) : (() => {
                                                                    try {
                                                                        const v = JSON.parse(ai.vahaan_status);
                                                                        return (
                                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                                                {[['Owner', v.owner_name], ['Vehicle', `${v.vehicle_make} ${v.vehicle_model}`], ['Color', v.vehicle_color], ['Insurance', v.insurance_valid_till]].map(([k, val]) => (
                                                                                    <div key={k} style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: '10px' }}>
                                                                                        <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>{k}</div>
                                                                                        <div style={{ fontWeight: 700, fontSize: '13px' }}>{val || '—'}</div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        );
                                                                    } catch {
                                                                        return <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{ai.vahaan_status}</span>;
                                                                    }
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : null}

                                            {/* Police official block */}
                                            {isPolice && (
                                                <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', padding: '20px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 900, color: '#6366F1', marginBottom: '10px' }}>🔵 OFFICIAL POLICE SUBMISSION</div>
                                                    <div style={{ fontWeight: 900, fontFamily: 'monospace', fontSize: '26px', color: 'var(--text-primary)', letterSpacing: '0.1em' }}>{report.number_plate || '—'}</div>
                                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '8px' }}>Submitted by authorized law enforcement personnel. No AI scan required.</div>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Right Column ── */}
                                        <div className="admin-right-col">

                                            {/* Media Evidence */}
                                            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid var(--border-color)' }}>
                                                <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>🖼️</span> Digital Evidence
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                                                    {(report.media_urls || []).map((m, idx) => (
                                                        <div key={idx} style={{
                                                            aspectRatio: '1/1', background: 'var(--bg-main)', borderRadius: '12px',
                                                            border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center',
                                                            justifyContent: 'center', fontSize: '28px', cursor: 'pointer',
                                                            transition: 'all 0.2s ease', backgroundImage: m.startsWith('http') || m.startsWith('blob') ? `url(${m})` : 'none',
                                                            backgroundSize: 'cover', backgroundPosition: 'center'
                                                        }}
                                                            onClick={(e) => { e.stopPropagation(); setPreviewMedia(m); }}
                                                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                                                        >
                                                            {!(m.startsWith('http') || m.startsWith('blob')) && (m.endsWith('.mp4') ? '🎬' : '🖼️')}
                                                        </div>
                                                    ))}
                                                    {(!report.media_urls || report.media_urls.length === 0) && (
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', gridColumn: '1/-1', padding: '16px', textAlign: 'center' }}>
                                                            No media attached
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Enforcement Actions */}
                                            <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid var(--border-color)', marginTop: 'auto' }}>
                                                <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>⚡</span> Enforcement Actions
                                                </div>

                                                {report.status === STATUS.AI_PROCESSED && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        <button
                                                            disabled={isActing}
                                                            onClick={() => handleAccept(report.report_id)}
                                                            style={{
                                                                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                                                                background: 'linear-gradient(135deg, var(--primary), #4F46E5)',
                                                                color: 'white', fontWeight: 900, fontSize: '13px',
                                                                textTransform: 'uppercase', letterSpacing: '0.06em', cursor: isActing ? 'wait' : 'pointer',
                                                                boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
                                                                transition: 'all 0.2s ease', opacity: isActing ? 0.7 : 1
                                                            }}
                                                            onMouseEnter={e => !isActing && (e.currentTarget.style.transform = 'translateY(-1px)')}
                                                            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                                                        >
                                                            {isActing ? '⏳ Processing…' : '✓ Verify & Accept'}
                                                        </button>
                                                        <button
                                                            disabled={isActing}
                                                            onClick={() => handleReject(report.report_id)}
                                                            style={{
                                                                width: '100%', padding: '14px', borderRadius: '12px',
                                                                border: '1px solid rgba(239,68,68,0.3)',
                                                                background: 'rgba(239,68,68,0.05)', color: '#EF4444',
                                                                fontWeight: 900, fontSize: '13px', textTransform: 'uppercase',
                                                                letterSpacing: '0.06em', cursor: isActing ? 'wait' : 'pointer',
                                                                transition: 'all 0.2s ease', opacity: isActing ? 0.7 : 1
                                                            }}
                                                            onMouseEnter={e => !isActing && (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
                                                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.05)')}
                                                        >
                                                            ✕ Dismiss Case
                                                        </button>
                                                    </div>
                                                )}

                                                {/* For Submitted reports (not yet AI processed) - allow manual review */}
                                                {report.status === STATUS.SUBMITTED && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        <button
                                                            disabled={isActing}
                                                            onClick={() => handleAccept(report.report_id)}
                                                            style={{
                                                                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                                                                background: 'linear-gradient(135deg, var(--primary), #4F46E5)',
                                                                color: 'white', fontWeight: 900, fontSize: '13px',
                                                                textTransform: 'uppercase', letterSpacing: '0.06em', cursor: isActing ? 'wait' : 'pointer',
                                                                boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
                                                                transition: 'all 0.2s ease', opacity: isActing ? 0.7 : 1
                                                            }}
                                                        >
                                                            {isActing ? '⏳ Processing…' : '✓ Accept Manually'}
                                                        </button>
                                                        <button
                                                            disabled={isActing}
                                                            onClick={() => handleReject(report.report_id)}
                                                            style={{
                                                                width: '100%', padding: '14px', borderRadius: '12px',
                                                                border: '1px solid rgba(239,68,68,0.3)',
                                                                background: 'rgba(239,68,68,0.05)', color: '#EF4444',
                                                                fontWeight: 900, fontSize: '13px', textTransform: 'uppercase',
                                                                letterSpacing: '0.06em', cursor: isActing ? 'wait' : 'pointer',
                                                                transition: 'all 0.2s ease', opacity: isActing ? 0.7 : 1
                                                            }}
                                                        >
                                                            ✕ Dismiss Case
                                                        </button>
                                                    </div>
                                                )}

                                                {report.status === STATUS.ADMIN_ACCEPTED && (
                                                    <button
                                                        disabled={isActing}
                                                        onClick={() => handleConfirmAndNotify(report.report_id)}
                                                        style={{
                                                            width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                                                            background: 'linear-gradient(135deg, #10B981, #059669)',
                                                            color: 'white', fontWeight: 900, fontSize: '13px',
                                                            textTransform: 'uppercase', letterSpacing: '0.06em', cursor: isActing ? 'wait' : 'pointer',
                                                            boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
                                                            transition: 'all 0.2s ease', opacity: isActing ? 0.7 : 1
                                                        }}
                                                    >
                                                        {isActing ? '⏳ Dispatching…' : '🔔 Dispatch E-Challan'}
                                                    </button>
                                                )}

                                                {[STATUS.POLICE_CONFIRMED, STATUS.OWNER_NOTIFIED].includes(report.status) && (
                                                    <div style={{ padding: '16px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', textAlign: 'center' }}>
                                                        <div style={{ fontSize: '20px', marginBottom: '6px' }}>✅</div>
                                                        <div style={{ color: '#10B981', fontWeight: 900, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Case Completed & Notified</div>
                                                    </div>
                                                )}

                                                {report.status === STATUS.ADMIN_REJECTED && (
                                                    <div style={{ padding: '16px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', textAlign: 'center' }}>
                                                        <div style={{ fontSize: '20px', marginBottom: '6px' }}>🚫</div>
                                                        <div style={{ color: '#EF4444', fontWeight: 900, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Case Dismissed</div>
                                                    </div>
                                                )}

                                                {/* ── Delete Report (always visible) ── */}
                                                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px dashed var(--border-color)' }}>
                                                    <button
                                                        disabled={isActing}
                                                        onClick={() => handleDelete(report.report_id)}
                                                        style={{
                                                            width: '100%', padding: '11px', borderRadius: '10px',
                                                            border: '1px solid rgba(239,68,68,0.25)',
                                                            background: 'transparent', color: '#EF4444',
                                                            fontWeight: 700, fontSize: '12px',
                                                            letterSpacing: '0.04em', cursor: isActing ? 'wait' : 'pointer',
                                                            transition: 'all 0.2s ease', opacity: isActing ? 0.5 : 0.7,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.opacity = '1'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '0.7'; }}
                                                    >
                                                        🗑️ Delete Report
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Spinner keyframe */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* Image Preview Modal */}
            <ImagePreviewModal mediaUrl={previewMedia} onClose={() => setPreviewMedia(null)} />
        </div>
    );
}

function ImagePreviewModal({ mediaUrl, onClose }) {
    if (!mediaUrl) return null;

    // Provide a random relevant traffic image if the url isn't an actual HTTP or Blob link
    const validUrl = (mediaUrl.startsWith('http') || mediaUrl.startsWith('blob') || mediaUrl.startsWith('data:'))
        ? mediaUrl
        : `https://images.unsplash.com/photo-1549317661-bc61563ce914?auto=format&fit=crop&q=80&w=800`;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
            }}
        >
            <img
                src={validUrl}
                alt="Digital Evidence"
                style={{
                    maxWidth: '90%', maxHeight: '90vh', borderRadius: '16px',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.5)', objectFit: 'contain'
                }}
                onClick={e => e.stopPropagation()}
            />
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: '24px', right: '32px', background: 'var(--bg-card)', border: 'none',
                    color: 'var(--text-primary)', fontSize: '24px', width: '48px', height: '48px', borderRadius: '50%',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                ✕
            </button>
        </div>
    );
}
