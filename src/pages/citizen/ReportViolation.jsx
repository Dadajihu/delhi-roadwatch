/* ──────────────────────────────────────────────
   Delhi RoadWatch — Report Violation (2026 SaaS Redesign)
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createReport, CRIME_TYPES, STATUS, nextReportId, uploadEvidence } from '../../data/db';
import { processReportWithAI } from '../../services/aiProcessor';

// Icon map for violation types
const CRIME_ICONS = {
    'Signal Jumping': '🚦',
    'Illegal Parking': '🚫',
    'No Helmet': '⛑️',
    'Triple Riding': '🛵',
    'Wrong Side Driving': '⬅️',
    'Overspeeding': '⚡',
    'Dangerous Driving': '⚠️',
    'Blocking Road': '🚧',
    'Other': '📋',
};

export default function ReportViolation() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState('capture'); // capture -> details -> review -> confirmed
    const [mediaFiles, setMediaFiles] = useState([]);
    const [crimeType, setCrimeType] = useState('');
    const [comments, setComments] = useState('');
    const [location, setLocation] = useState('Fetching location...');
    const [timestamp, setTimestamp] = useState(new Date().toLocaleTimeString());
    const [submittedId, setSubmittedId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [aiProcessing, setAiProcessing] = useState(false);
    const [aiDone, setAiDone] = useState(false);

    // Auto-fetch location & update clock
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
                () => setLocation('28.6139, 77.2090') // New Delhi default
            );
        }
        const timer = setInterval(() => setTimestamp(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleFileUpload = (e, source) => {
        const files = Array.from(e.target.files);
        const now = new Date();

        const newMedia = files.map(f => ({
            file: f,
            name: f.name,
            type: f.type,
            url: URL.createObjectURL(f),
            takenAt: source === 'live' ? now : new Date(f.lastModified),
            source: source
        }));
        setMediaFiles(prev => [...prev, ...newMedia]);
    };

    const removeMedia = (idx) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const reportId = nextReportId();
            const submissionTime = new Date().toISOString();

            // 1. Upload all media to Supabase Storage first to get Public URLs
            const uploadedUrls = [];
            for (let i = 0; i < mediaFiles.length; i++) {
                const { file, name } = mediaFiles[i];
                const fileExt = name.split('.').pop();
                const randomName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const publicUrl = await uploadEvidence(file, `${reportId}/${randomName}`);
                uploadedUrls.push(publicUrl);
            }

            // 2. Create the Database Record with actual remote URLs
            const photoTaken = mediaFiles.length > 0 ? mediaFiles[0].takenAt : null;
            const photoTakenStr = photoTaken ? photoTaken.toLocaleString('en-IN') : '';

            const reportData = {
                report_id: reportId,
                citizen_id: currentUser.user_id,
                reported_by: currentUser?.role === 'police' ? 'police' : 'citizen',
                media_urls: uploadedUrls,
                crime_type: crimeType,
                comments: `${comments}${location ? `\n\n[Location: ${location}]` : ''}${photoTakenStr ? `\n[Photo Taken: ${photoTakenStr}]` : ''}`,
                status: STATUS.SUBMITTED,
                submission_time: submissionTime
            };

            await createReport(reportData);

            // Show success screen IMMEDIATELY (non-blocking)
            setSubmittedId(reportId);
            setStep('confirmed');

            // Run AI analysis in background (client-side)
            if (uploadedUrls.length > 0) {
                setAiProcessing(true);
                setAiDone(false);
                processReportWithAI(reportId, uploadedUrls[0], crimeType, comments)
                    .then(() => { setAiProcessing(false); setAiDone(true); })
                    .catch((err) => {
                        console.error('[AI] Background processing failed:', err);
                        setAiProcessing(false);
                    });
            }

        } catch (error) {
            console.error("Submission Error:", error);
            alert("Digital sync failed. Please check your connection or wait a moment.");
        } finally {
            setSubmitting(false);
        }
    };

    const renderStepper = () => {
        const currentIdx = ['capture', 'details', 'review', 'confirmed'].indexOf(step);
        if (currentIdx > 2) return null;

        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: 'var(--space-40)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '28px', height: '28px', borderRadius: '50%', background: currentIdx >= 0 ? 'var(--primary-light)' : '#E2E8F0',
                        color: currentIdx >= 0 ? 'var(--primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 800, border: currentIdx === 0 ? '1px solid var(--primary)' : 'none'
                    }}>1</div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: currentIdx >= 0 ? 'var(--primary)' : 'var(--text-muted)' }}>Evidence</span>
                </div>
                <div style={{ width: '40px', height: '1px', background: '#E2E8F0' }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '28px', height: '28px', borderRadius: '50%', background: currentIdx >= 1 ? 'var(--primary-light)' : '#E2E8F0',
                        color: currentIdx >= 1 ? 'var(--primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 800, border: currentIdx === 1 ? '1px solid var(--primary)' : 'none'
                    }}>2</div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: currentIdx >= 1 ? 'var(--primary)' : 'var(--text-muted)' }}>Details</span>
                </div>
            </div>
        );
    };

    if (step === 'capture') {
        return (
            <div className="animate-up" style={{ maxWidth: '500px', margin: '0 auto', width: '100%' }}>
                {renderStepper()}

                <div style={{ textAlign: 'center', marginBottom: 'var(--space-24)' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1E293B', marginBottom: '12px' }}>Upload Evidence</h1>
                    <p style={{ color: '#64748B', fontSize: '15px', lineHeight: '1.6', fontWeight: 500 }}>
                        Please provide a clear photo or video of the traffic violation. Clear views of number plates help AI analysis.
                    </p>
                </div>

                {/* ── Camera / Upload Options ── */}
                <div style={{
                    borderRadius: '24px',
                    background: 'white',
                    border: '1px solid var(--border-color)',
                    marginBottom: 'var(--space-24)',
                    overflow: 'hidden'
                }}>
                    {/* Direct Camera Row */}
                    <div style={{ padding: '20px 20px 12px', borderBottom: '1px dashed var(--border-color)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>📷 Capture Live</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {/* Photo Camera */}
                            <label style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                gap: '10px', padding: '24px 12px', minHeight: '110px',
                                background: 'var(--primary-light)', border: '1.5px solid rgba(37,99,235,0.2)',
                                borderRadius: '18px', cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.12)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-light)'}
                            >
                                <span style={{ fontSize: '36px' }}>📷</span>
                                <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--primary)' }}>Photo</span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Opens camera</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(e) => handleFileUpload(e, 'live')}
                                    style={{ display: 'none' }}
                                />
                            </label>

                            {/* Video Camera */}
                            <label style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                gap: '10px', padding: '24px 12px', minHeight: '110px',
                                background: 'rgba(239,68,68,0.05)', border: '1.5px solid rgba(239,68,68,0.2)',
                                borderRadius: '18px', cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.05)'}
                            >
                                <span style={{ fontSize: '36px' }}>🎥</span>
                                <span style={{ fontWeight: 800, fontSize: '13px', color: '#EF4444' }}>Video</span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Record live</span>
                                <input
                                    type="file"
                                    accept="video/*"
                                    capture="environment"
                                    onChange={(e) => handleFileUpload(e, 'live')}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Gallery Upload */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '18px 20px', cursor: 'pointer',
                        transition: 'background 0.2s ease'
                    }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-main)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <div style={{
                            width: '48px', height: '48px', borderRadius: '14px',
                            background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '22px', flexShrink: 0
                        }}>🖼️</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>Upload from Gallery</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, marginTop: '2px' }}>Select existing photos or videos from device</div>
                        </div>
                        <div style={{ fontSize: '18px', color: 'var(--text-muted)' }}>›</div>
                        <input
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            onChange={(e) => handleFileUpload(e, 'upload')}
                            style={{ display: 'none' }}
                        />
                    </label>
                </div>

                {mediaFiles.length > 0 && (
                    <div style={{ marginBottom: 'var(--space-24)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        {mediaFiles.map((m, i) => (
                            <div key={i} style={{ aspectRatio: '1/1', position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                {m.type.startsWith('image') ? <img src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>🎬</div>}
                                <button onClick={() => removeMedia(i)} style={{ position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', fontSize: '10px' }}>✕</button>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 'var(--space-40)' }}>
                    <div className="card" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #F1F5F9', boxShadow: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>
                            📍 LOCATION
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>{location}</div>
                    </div>
                    <div className="card" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #F1F5F9', boxShadow: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>
                            ⏰ TIMESTAMP
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>{timestamp}</div>
                    </div>
                </div>

                <div style={{ marginTop: 'var(--space-32)', paddingBottom: 'var(--space-96)' }}>
                    <button className="btn btn-primary" style={{ width: '100%', padding: '18px', borderRadius: '16px' }} disabled={mediaFiles.length === 0} onClick={() => setStep('details')}>
                        Next Step: Incident Details →
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'details') {
        return (
            <div className="animate-up" style={{ maxWidth: '500px', margin: '0 auto', width: '100%' }}>
                {renderStepper()}

                <div style={{ textAlign: 'center', marginBottom: 'var(--space-24)' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1E293B', marginBottom: '12px' }}>Incident Details</h1>
                    <p style={{ color: '#64748B', fontSize: '15px', lineHeight: '1.6', fontWeight: 500 }}>
                        Categorize the violation and add any relevant remarks for the enforcement team.
                    </p>
                </div>

                {/* ── Violation Type Grid ── */}
                <div style={{ marginBottom: 'var(--space-24)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>Select Violation Type</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '6px' }}>
                        {CRIME_TYPES.map(c => {
                            const isSelected = crimeType === c;
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCrimeType(c)}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        gap: '6px', padding: '14px 8px',
                                        background: isSelected ? 'var(--primary)' : 'white',
                                        border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}`,
                                        borderRadius: '14px', cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                                        boxShadow: isSelected ? '0 4px 14px rgba(37,99,235,0.3)' : 'none',
                                        transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                                    }}
                                >
                                    <span style={{ fontSize: '24px', lineHeight: 1 }}>{CRIME_ICONS[c] || '📋'}</span>
                                    <span style={{
                                        fontSize: '10px', fontWeight: 800, textAlign: 'center',
                                        color: isSelected ? 'white' : 'var(--text-secondary)',
                                        textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.3
                                    }}>{c}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Comments Textarea ── */}
                <div style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid var(--border-color)', marginBottom: 'var(--space-32)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Additional Remarks (Optional)</div>
                    <textarea
                        className="form-input"
                        style={{ minHeight: '100px', resize: 'none', fontSize: '14px', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '10px', width: '100%', boxSizing: 'border-box' }}
                        placeholder="Describe what you observed..."
                        value={comments}
                        onChange={e => setComments(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', gap: '16px', marginTop: 'var(--space-32)', paddingBottom: 'var(--space-96)' }}>
                    <button className="btn btn-secondary" style={{ flex: 1, padding: '18px', borderRadius: '16px' }} onClick={() => setStep('capture')}>Back</button>
                    <button className="btn btn-primary" style={{ flex: 2, padding: '18px', borderRadius: '16px' }} disabled={!crimeType} onClick={() => setStep('review')}>
                        Review Report →
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'review') {
        const submissionTime = new Date().toLocaleString();
        return (
            <div className="animate-up" style={{ maxWidth: '500px', margin: '0 auto', width: '100%' }}>
                {renderStepper()}

                <div style={{ textAlign: 'center', marginBottom: 'var(--space-24)' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1E293B', marginBottom: '12px' }}>Final Review</h1>
                    <p style={{ color: '#64748B', fontSize: '15px', lineHeight: '1.6', fontWeight: 500 }}>
                        Verify the incident data before official submission to the Delhi RoadWatch Cloud.
                    </p>
                </div>

                <div className="card" style={{ marginBottom: 'var(--space-24)', padding: 'var(--space-24)', borderRadius: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-24)' }}>
                        <div>
                            <div className="text-meta" style={{ fontWeight: 700, fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>VIOLATION</div>
                            <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '16px', marginBottom: 'var(--space-16)' }}>{crimeType}</div>

                            <div className="text-meta" style={{ fontWeight: 700, fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>GPS COORDS</div>
                            <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>{location}</div>
                        </div>
                        <div>
                            <div className="text-meta" style={{ fontWeight: 700, fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>SUBMISSION WINDOW</div>
                            <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>{submissionTime}</div>
                        </div>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 'var(--space-40)', padding: 'var(--space-24)', borderRadius: '24px' }}>
                    <div className="text-meta" style={{ fontWeight: 700, fontSize: '10px', marginBottom: 'var(--space-16)', textTransform: 'uppercase' }}>ATTACHED MEDIA ({mediaFiles.length})</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {mediaFiles.map((m, i) => (
                            <div key={i} style={{ width: '60px', height: '60px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                                {m.type.startsWith('image') ? <img src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>🎬</div>}
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', marginTop: 'var(--space-32)', paddingBottom: 'var(--space-96)' }}>
                    <button className="btn btn-secondary" style={{ flex: 1, padding: '18px', borderRadius: '16px' }} onClick={() => setStep('details')}>Edit</button>
                    <button className="btn btn-primary" style={{ flex: 2, padding: '18px', borderRadius: '16px' }} onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Archiving Evidence...' : 'Submit Incident ✓'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-up" style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card text-center" style={{ maxWidth: '440px', padding: 'var(--space-40)', borderRadius: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                <div style={{ width: '80px', height: '80px', background: 'var(--success-light)', color: 'var(--success)', fontSize: '40px', margin: '0 auto var(--space-24)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
                <h2 style={{ marginBottom: 'var(--space-16)', fontSize: '28px', fontWeight: 800, textAlign: 'center' }}>Incident Logged</h2>
                <p className="text-body" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-16)', fontSize: '15px', textAlign: 'center' }}>
                    Case Ref: <strong style={{ color: 'var(--text-primary)' }}>#{submittedId.slice(0, 8)}</strong> has been successfully archived with encrypted GPS coordinates and timestamps.
                </p>

                {/* AI Processing Status */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '10px 18px', borderRadius: '12px', marginBottom: 'var(--space-24)',
                    background: aiDone ? 'rgba(16,185,129,0.08)' : aiProcessing ? 'rgba(37,99,235,0.08)' : 'var(--bg-main)',
                    border: `1px solid ${aiDone ? 'rgba(16,185,129,0.2)' : aiProcessing ? 'rgba(37,99,235,0.2)' : 'var(--border-color)'}`
                }}>
                    {aiProcessing && (
                        <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid var(--primary-light)', borderTopColor: 'var(--primary)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: '12px', fontWeight: 700, color: aiDone ? '#10B981' : aiProcessing ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {aiDone ? '✓ AI Analysis Complete — visible in admin panel'
                            : aiProcessing ? 'AI Engine analysing evidence…'
                                : '⏳ AI analysis will run shortly'}
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
                    <button className="btn btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '16px' }} onClick={() => { setStep('capture'); setMediaFiles([]); setCrimeType(''); setComments(''); }}>New Report</button>
                    <button className="btn btn-secondary" style={{ width: '100%', padding: '16px', borderRadius: '16px' }} onClick={() => navigate(currentUser?.role === 'police' ? '/police/my-reports' : '/citizen/my-reports')}>History</button>
                </div>
            </div>
        </div>
    );
}
