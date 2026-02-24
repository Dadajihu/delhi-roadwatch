/* ──────────────────────────────────────────────
   Delhi RoadWatch — Report Violation (2026 SaaS Redesign)
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createReport, CRIME_TYPES, STATUS, nextReportId } from '../../data/db';
import { processReport } from '../../services/aiEngine';

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
            const mediaNames = mediaFiles.map(m => m.name);
            const submissionTime = new Date().toISOString();

            const reportData = {
                report_id: reportId,
                citizen_id: currentUser.user_id,
                reported_by: 'citizen',
                media_urls: mediaNames,
                crime_type: crimeType,
                comments: `${comments}${location ? `\n\n[Location: ${location}]` : ''}`,
                status: STATUS.SUBMITTED,
                submission_time: submissionTime
            };

            await createReport(reportData);

            const firstImage = mediaFiles.find(m => m.type.startsWith('image'))?.file;
            try {
                await processReport(reportData, firstImage);
            } catch (aiErr) {
                console.error("Non-critical AI Error:", aiErr);
            }

            setSubmittedId(reportId);
            setStep('confirmed');
        } catch (error) {
            console.error("Submission Error:", error);
            alert("Digital sync failed. Please check your connection.");
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

                <div style={{ textAlign: 'left', marginBottom: 'var(--space-24)' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1E293B', marginBottom: '12px' }}>Upload Evidence</h1>
                    <p style={{ color: '#64748B', fontSize: '15px', lineHeight: '1.6', fontWeight: 500 }}>
                        Please provide a clear photo or video of the traffic violation. Clear views of number plates help AI analysis.
                    </p>
                </div>

                <div style={{
                    border: '2px dashed #E2E8F0',
                    borderRadius: '24px',
                    padding: 'var(--space-40) var(--space-24)',
                    background: 'white',
                    marginBottom: 'var(--space-40)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-24)'
                }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <label className="card" style={{ flex: 1, padding: '24px', textAlign: 'center', cursor: 'pointer', border: '1px solid #F1F5F9', borderRadius: '20px', transition: 'all 0.2s ease', boxShadow: 'none' }}>
                            <div style={{ fontSize: '28px', color: 'var(--primary)', marginBottom: '12px' }}>📷</div>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: '#1E293B' }}>Photo</div>
                            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, 'live')} style={{ display: 'none' }} />
                        </label>
                        <label className="card" style={{ flex: 1, padding: '24px', textAlign: 'center', cursor: 'pointer', border: '1px solid #F1F5F9', borderRadius: '20px', transition: 'all 0.2s ease', boxShadow: 'none' }}>
                            <div style={{ fontSize: '28px', color: '#EF4444', marginBottom: '12px', position: 'relative' }}>
                                📹
                                <div style={{ position: 'absolute', top: '-2px', right: '25%', width: '8px', height: '8px', background: '#EF4444', borderRadius: '50%', border: '2px solid white' }}></div>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: '#1E293B' }}>Video</div>
                            <input type="file" accept="video/*" capture="environment" onChange={(e) => handleFileUpload(e, 'live')} style={{ display: 'none' }} />
                        </label>
                    </div>

                    <label className="btn btn-primary" style={{ width: '100%', padding: '18px', borderRadius: '16px', gap: '12px', fontSize: '15px', fontWeight: 700 }}>
                        <span>📤</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '15px' }}>Upload from Gallery</div>
                            <div style={{ fontSize: '11px', opacity: 0.8, fontWeight: 500 }}>Select existing photo/video</div>
                        </div>
                        <input type="file" accept="image/*,video/*" multiple onChange={(e) => handleFileUpload(e, 'upload')} style={{ display: 'none' }} />
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

                <div style={{ textAlign: 'left', marginBottom: 'var(--space-24)' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1E293B', marginBottom: '12px' }}>Incident Details</h1>
                    <p style={{ color: '#64748B', fontSize: '15px', lineHeight: '1.6', fontWeight: 500 }}>
                        Categorize the violation and add any relevant remarks for the enforcement team.
                    </p>
                </div>

                <div className="card" style={{ marginBottom: 'var(--space-32)', padding: 'var(--space-24)', borderRadius: '24px' }}>
                    <div className="form-group" style={{ marginBottom: 'var(--space-24)' }}>
                        <label className="form-label" style={{ fontWeight: 800, fontSize: '12px', color: 'var(--primary)', letterSpacing: '0.05em' }}>VIOLATION CATEGORY</label>
                        <select className="form-input" value={crimeType} onChange={(e) => setCrimeType(e.target.value)} style={{ fontSize: '16px', fontWeight: 600, border: '1px solid #E2E8F0', padding: '14px' }}>
                            <option value="">Select violation type...</option>
                            {CRIME_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontWeight: 800, fontSize: '12px', color: 'var(--primary)', letterSpacing: '0.05em' }}>OFFICER REMARKS (OPTIONAL)</label>
                        <textarea className="form-input" style={{ minHeight: '120px', resize: 'none', fontSize: '15px', border: '1px solid #E2E8F0', padding: '14px' }} placeholder="Provide specific context or observations..." value={comments} onChange={e => setComments(e.target.value)} />
                    </div>
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

                <div style={{ textAlign: 'left', marginBottom: 'var(--space-24)' }}>
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
                <h2 style={{ marginBottom: 'var(--space-16)', fontSize: '28px', fontWeight: 800 }}>Incident Logged</h2>
                <p className="text-body" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-32)', fontSize: '15px' }}>
                    Case Ref: <strong style={{ color: 'var(--text-primary)' }}>#{submittedId.slice(0, 8)}</strong> has been successfully archived with encrypted GPS coordinates and timestamps.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
                    <button className="btn btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '16px' }} onClick={() => { setStep('capture'); setMediaFiles([]); setCrimeType(''); setComments(''); }}>New Report</button>
                    <button className="btn btn-secondary" style={{ width: '100%', padding: '16px', borderRadius: '16px' }} onClick={() => navigate('/citizen/my-reports')}>History</button>
                </div>
            </div>
        </div>
    );
}
