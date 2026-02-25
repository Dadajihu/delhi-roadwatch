/* ──────────────────────────────────────────────
   Delhi RoadWatch — Police Dashboard (Report Only, Supabase)
   ────────────────────────────────────────────── */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createReport, fetchReports, CRIME_TYPES, STATUS, nextReportId } from '../../data/db';

export default function PoliceDashboard() {
    const { currentUser } = useAuth();

    const [step, setStep] = useState('capture');
    const [mediaFiles, setMediaFiles] = useState([]);
    const [crimeType, setCrimeType] = useState('');
    const [numberPlate, setNumberPlate] = useState('');
    const [comments, setComments] = useState('');
    const [submittedId, setSubmittedId] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [voiceMode, setVoiceMode] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [selectedLang, setSelectedLang] = useState('hi-IN');
    const [voiceError, setVoiceError] = useState('');

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    const startRecording = async () => {
        setVoiceError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                await transcribeAudioCore(audioBlob);
            };
            recorder.start(250);
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
        } catch (err) {
            setVoiceError('Could not access microphone.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        clearInterval(timerRef.current);
        setIsRecording(false);
    };

    const transcribeAudioCore = async (audioBlob) => {
        setIsTranscribing(true);
        setVoiceError('');
        try {
            const { transcript } = await speechToText(audioBlob, selectedLang);
            if (transcript) {
                setComments(prev => prev ? `${prev}
${transcript}` : transcript);
            } else {
                setVoiceError('No speech detected.');
            }
        } catch (err) {
            setVoiceError(err.message || 'Transcription failed.');
        } finally {
            setIsTranscribing(false);
        }
    };

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const [myReportsCount, setMyReportsCount] = useState(0);

    useEffect(() => {
        async function load() {
            const reports = await fetchReports({ citizen_id: currentUser?.user_id });
            setMyReportsCount(reports.length);
        }
        load();
    }, [currentUser, step]);

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files);
        const newMedia = files.map(f => ({ file: f, name: f.name, type: f.type, url: URL.createObjectURL(f) }));
        setMediaFiles(prev => [...prev, ...newMedia]);
    };

    const removeMedia = (idx) => setMediaFiles(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async () => {
        setSubmitting(true);
        const reportId = nextReportId();

        const report = {
            report_id: reportId,
            citizen_id: currentUser.user_id,
            reported_by: 'police',
            media_urls: mediaFiles.map(m => m.name),
            crime_type: crimeType,
            comments,
            number_plate: numberPlate.toUpperCase(),
            status: STATUS.ADMIN_ACCEPTED,
        };

        await createReport(report);
        setSubmittedId(reportId);
        setStep('confirmed');
        setSubmitting(false);
    };

    const canSubmit = crimeType && mediaFiles.length > 0 && numberPlate.trim().length > 0;

    if (step === 'capture') {
        return (
            <div className="animate-up" style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
                <header style={{ marginBottom: '40px', textAlign: 'center' }}>
                    <h1 style={{ marginBottom: '16px', fontSize: '36px', fontWeight: 900 }}>Official Incident Report</h1>
                    <p style={{ maxWidth: '600px', fontSize: '16px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 auto' }}>File a traffic violation report directly. Officer submissions are processed with high-priority status.</p>
                </header>


                <div className="card" style={{ marginBottom: '40px', padding: '40px', textAlign: 'center', borderStyle: 'dashed', background: 'var(--bg-main)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚔</div>
                    <h3>Capture Evidence</h3>
                    <p className="text-sm" style={{ marginBottom: '24px' }}>Incident evidence for direct verification.</p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                            <span>📸</span> Take Photo
                            <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} style={{ display: 'none' }} />
                        </label>
                        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                            <span>📁</span> Upload Media
                            <input type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>

                {mediaFiles.length > 0 && (
                    <div className="card" style={{ marginBottom: '40px' }}>
                        <h4 style={{ marginBottom: '16px', fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Evidence ({mediaFiles.length})</h4>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {mediaFiles.map((m, i) => (
                                <div key={i} className="card" style={{ width: '100px', height: '100px', padding: '0', overflow: 'hidden', position: 'relative', boxShadow: 'none' }}>
                                    {m.type.startsWith('image') ? <img src={m.url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>🎬</div>}
                                    <button onClick={() => removeMedia(i)} style={{ position: 'absolute', top: '2px', right: '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="card" style={{ marginBottom: '40px', padding: 'var(--space-32)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-24)', marginBottom: 'var(--space-24)' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontWeight: 800 }}>Vehicle Registration</label>
                            <input className="form-input" type="text" placeholder="DL 01 AB 1234" value={numberPlate} onChange={e => setNumberPlate(e.target.value)} required style={{ fontSize: '16px', fontWeight: 700 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontWeight: 800 }}>Violation Category</label>
                            <select className="form-input" value={crimeType} onChange={e => setCrimeType(e.target.value)} style={{ fontSize: '16px', fontWeight: 600 }}>
                                <option value="">Select violation...</option>
                                {CRIME_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-24)' }}>
                        <label className="form-label" style={{ fontWeight: 800 }}>Officer Remarks</label>
                        <textarea className="form-input" style={{ minHeight: '100px', fontSize: '15px' }} placeholder="Provide specific incident details..." value={comments} onChange={e => setComments(e.target.value)} />
                    </div>
                </div>

                <div style={{ paddingBottom: '80px' }}>
                    <button className="btn btn-primary" style={{ width: '100%', padding: '16px' }} disabled={!canSubmit} onClick={() => setStep('review')}>
                        Next: Review Report Details →
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'review') {
        return (
            <div className="animate-up" style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
                <header style={{ marginBottom: '40px', textAlign: 'center' }}>
                    <h1 style={{ marginBottom: '16px', fontSize: '36px', fontWeight: 900 }}>Review Incident</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '16px', lineHeight: '1.6' }}>Review all gathered evidence and details before official filing.</p>
                </header>

                <div className="card" style={{ marginBottom: '40px', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'center' }}>
                        <div>
                            <div style={{ marginBottom: '16px' }}>
                                <div className="text-sm" style={{ marginBottom: '4px', textAlign: 'center' }}>VEHICLE</div>
                                <div style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '0.05em' }}>{numberPlate.toUpperCase()}</div>
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <div className="text-sm" style={{ marginBottom: '4px', textAlign: 'center' }}>VIOLATION</div>
                                <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--danger)' }}>{crimeType}</div>
                            </div>
                            <div>
                                <div className="text-sm" style={{ marginBottom: '4px', textAlign: 'center' }}>REMARKS</div>
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{comments || 'No specific remarks.'}</p>
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                            <div className="text-sm" style={{ marginBottom: '12px', textAlign: 'center' }}>ATTACHED EVIDENCE</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                {mediaFiles.map((m, i) => (
                                    <div key={i} style={{ width: '80px', height: '80px', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg-main)' }}>
                                        {m.type.startsWith('image') ? <img src={m.url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎬</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="badge badge-info" style={{ width: '100%', padding: '16px', marginBottom: '40px', borderRadius: '12px', textTransform: 'none' }}>
                    💡 Official submissions are instantly verified and do not require AI pre-processing.
                </div>

                <div style={{ display: 'flex', gap: '16px', paddingBottom: '80px' }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('capture')}>← Back</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Filing official report...' : 'Finalize and File Report ✓'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-up" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <div className="card text-center" style={{ maxWidth: '480px', padding: '48px' }}>
                <div style={{ fontSize: '64px', marginBottom: '24px' }}>🛡️</div>
                <h2 style={{ marginBottom: '16px' }}>Report Filed</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Official case <strong>#{submittedId.slice(0, 8)}</strong> has been filed and added to the administrative queue.</p>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setStep('capture'); setMediaFiles([]); setCrimeType(''); setNumberPlate(''); setComments(''); }}>
                    File New Report
                </button>
            </div>
        </div>
    );
}
