/* ──────────────────────────────────────────────
   Delhi RoadWatch — AI Processor
   Pure REST API (no SDK, maximum reliability)
   ────────────────────────────────────────────── */

import { supabase } from '../lib/supabase';

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
const SE_USER = import.meta.env.VITE_SE_USER;
const SE_SECRET = import.meta.env.VITE_SE_SECRET;

// ─────────────────────────────────────────────
// Base64 (chunk safe)
// ─────────────────────────────────────────────
function toB64(bytes) {
    const CHUNK = 8192;
    let s = '';
    for (let i = 0; i < bytes.length; i += CHUNK)
        s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return btoa(s);
}

// ─────────────────────────────────────────────
// Load image  (fetch → canvas → null)
// ─────────────────────────────────────────────
async function loadImage(url) {
    try {
        const r = await fetch(url);
        if (r.ok) {
            const mime = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
            const b64 = toB64(new Uint8Array(await r.arrayBuffer()));
            console.log(`[AI] fetch OK — ${Math.round(b64.length / 1000)}KB`);
            return { mimeType: mime, data: b64 };
        }
        console.warn('[AI] fetch status:', r.status);
    } catch (e) { console.warn('[AI] fetch threw:', e.message); }

    try {
        const b64 = await new Promise((res, rej) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const MAX = 1024, sc = img.width > MAX ? MAX / img.width : 1;
                const cv = document.createElement('canvas');
                cv.width = Math.round(img.width * sc);
                cv.height = Math.round(img.height * sc);
                cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                res(cv.toDataURL('image/jpeg', 0.85).split(',')[1]);
            };
            img.onerror = () => rej(new Error('img.onerror'));
            img.src = url;
        });
        console.log(`[AI] canvas OK — ${Math.round(b64.length / 1000)}KB`);
        return { mimeType: 'image/jpeg', data: b64 };
    } catch (e) { console.warn('[AI] canvas threw:', e.message); }

    console.error('[AI] Could not load image — will run text-only');
    return null;
}

// ─────────────────────────────────────────────
// Raw Gemini REST call
// ─────────────────────────────────────────────
async function geminiREST(parts, wantJson = false) {
    const body = {
        contents: [{ role: 'user', parts }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 800, // Always give enough room for the output
            ...(wantJson ? { responseMimeType: 'application/json' } : {})
        }
    };
    const r = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const json = await r.json();
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${json?.error?.message || JSON.stringify(json?.error)}`);
    const candidate = json?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (text === undefined) throw new Error('Gemini returned no text. Finish reason: ' + (candidate?.finishReason || 'Unknown'));
    return text;
}

// ─────────────────────────────────────────────
// PLATE DETECTION
// ─────────────────────────────────────────────
async function detectPlate(imgData) {
    if (!imgData) return null;

    const parts = [
        {
            text: `Look at this image. Find any vehicle number plate.
Indian plates: white/yellow rectangle, black text e.g. HR26DQ5588 DL1CAB1234 MH12AB1234.
Even if it is slightly blurry or partial, try your very best to extract every readable character.

Respond with ONLY a JSON object:
{
  "detected_plate": "<plate string without spaces, e.g. HR26DQ5588, or null if absolutely no plate is visible>"
}` },
        { inline_data: { mime_type: imgData.mimeType, data: imgData.data } }
    ];

    try {
        const text = await geminiREST(parts, true); // true = force application/json
        console.log('[PLATE] Raw JSON:', text);
        const parsed = JSON.parse(text);

        if (!parsed.detected_plate) return null;

        const raw = parsed.detected_plate.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (raw.length < 4 || raw === 'NONE' || raw === 'NULL') return null;
        return raw;
    } catch (e) {
        console.error('[PLATE] Error:', e.message);
        return null;
    }
}

// ─────────────────────────────────────────────
// VIOLATION ANALYSIS
// ─────────────────────────────────────────────
async function analyseViolation(imgData, crimeType, remarks) {
    const prompt = `You are a traffic violation analyst for Delhi Police.
${imgData ? 'Analyse the attached image.' : 'No image provided.'}

Violation: ${crimeType}
Remarks: ${remarks || 'none'}

Respond with ONLY a JSON object (no markdown):
{
  "confidence_score": <integer 0-100, probability that a real traffic violation is shown in the image (100 = obvious violation, 0 = no violation at all)>,
  "verdict": "<CONFIRMED_VIOLATION|PROBABLE_VIOLATION|INSUFFICIENT_EVIDENCE|NO_VIOLATION_DETECTED>",
  "ai_comments": "<40-80 words describing what is visible and why. End with 'I am very sure.' if score>=75, 'Research more.' if 45-74, or 'Research more, but I don't think so.' if <45>"
}`;

    const parts = imgData
        ? [{ text: prompt }, { inline_data: { mime_type: imgData.mimeType, data: imgData.data } }]
        : [{ text: prompt }];

    try {
        const text = await geminiREST(parts, true);  // responseMimeType=application/json
        console.log('[ANALYSIS] Raw:', text.slice(0, 300));
        return JSON.parse(text);
    } catch (e) {
        // Instead of swallowing the error, throw it so it gets displayed
        const text2 = await geminiREST(parts, false);

        // Try strict extraction first
        let m = text2.match(/\{[\s\S]*\}/);

        // If no closing bracket is found, it might have been cut off or flagged midway
        if (!m) {
            // Find the start of the object
            const start = text2.indexOf('{');
            if (start !== -1) {
                // Try to forcefully close the JSON to salvage something
                let salvaged = text2.slice(start).trim();
                if (!salvaged.endsWith('}')) {
                    if (!salvaged.endsWith('"')) salvaged += '"';
                    salvaged += '}';
                }
                m = [salvaged];
            }
        }

        if (m) {
            try {
                return JSON.parse(m[0]);
            } catch (e3) {
                // If it STILL fails to parse, create a fallback object directly from the text
                return {
                    confidence_score: 0,
                    verdict: "INSUFFICIENT_EVIDENCE",
                    ai_comments: "Analysis yielded partial response: " + text2.slice(0, 50).replace(/["\n\r]/g, '') + "... " + enforceEnding('', 0)
                };
            }
        }

        throw new Error("No JSON object found: " + text2.slice(0, 100) + "...");
    }
}

// ─────────────────────────────────────────────
// SIGHTENGINE
// ─────────────────────────────────────────────
async function deepfakeScore(imageUrl) {
    try {
        const f = new URLSearchParams({ api_user: SE_USER, api_secret: SE_SECRET, url: imageUrl, models: 'genai' });
        const r = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: f });
        const d = await r.json();
        const s = d?.type?.ai_generated ?? d?.ai_generated?.score;
        if (typeof s === 'number') return Math.round(s * 100);
    } catch (e) { console.warn('[SE]', e.message); }
    return 0;
}

// ─────────────────────────────────────────────
// Ending phrase enforcement
// ─────────────────────────────────────────────
function fixEnding(text, score) {
    const OK = ['I am very sure.', 'Research more.', "Research more, but I don't think so."];
    if (OK.some(p => text.trim().endsWith(p))) return text.trim();
    const phrase = score >= 75 ? OK[0] : score >= 45 ? OK[1] : OK[2];
    return text.trim().replace(/[.!?]+$/, '') + ' ' + phrase;
}

// ─────────────────────────────────────────────
// Supabase persist
// ─────────────────────────────────────────────
async function save(reportId, payload) {
    const { data: rows, error: ue } = await supabase
        .from('ai_analysis').update(payload).eq('report_id', reportId).select('report_id');
    if (ue) throw new Error('UPDATE: ' + ue.message);
    if (!rows?.length) {
        const { error: ie } = await supabase
            .from('ai_analysis').insert({ report_id: reportId, ...payload });
        if (ie) throw new Error('INSERT: ' + ie.message);
    }
    await supabase.from('reports').update({ status: 'AI Processed' }).eq('report_id', reportId);
}

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────
export async function processReportWithAI(reportId, imageUrl, crimeType, comments) {
    if (!imageUrl) return;
    console.log(`\n[AI] ═══ ${reportId} ═══`);

    let confidence = 0, deepfake = 0;
    let plate = 'REVIEW REQUIRED';
    let summary = '[INSUFFICIENT_EVIDENCE] Analysis could not complete. Manual review required.';

    // Load image once
    const imgData = await loadImage(imageUrl);

    // Run all 3 in parallel
    const [plateRes, analysisRes, seRes] = await Promise.allSettled([
        detectPlate(imgData),
        analyseViolation(imgData, crimeType, comments),
        deepfakeScore(imageUrl)
    ]);

    if (plateRes.status === 'fulfilled' && plateRes.value) plate = plateRes.value;
    if (seRes.status === 'fulfilled') deepfake = seRes.value;

    if (analysisRes.status === 'fulfilled' && analysisRes.value) {
        const g = analysisRes.value;
        confidence = typeof g.confidence_score === 'number'
            ? Math.min(100, Math.max(0, Math.round(g.confidence_score))) : 0;
        const verdict = g.verdict || 'INSUFFICIENT_EVIDENCE';
        const comment = fixEnding(g.ai_comments || '', confidence);
        summary = `[${verdict}] ${comment}`;
    } else {
        // Save the actual error so admin can SEE it
        const errMsg = analysisRes.status === 'rejected'
            ? analysisRes.reason?.message
            : 'Gemini returned no parseable JSON';
        console.error('[AI] Analysis error:', errMsg);
        summary = `[INSUFFICIENT_EVIDENCE] AI Error: ${errMsg?.slice(0, 200) || 'Unknown'}`;
    }

    console.log(`[AI] plate=${plate} conf=${confidence}% deepfake=${deepfake}%`);
    try {
        await save(reportId, {
            ai_summary: summary,
            confidence_score: confidence,
            detected_vehicle_number: plate,
            ai_generated_score: deepfake,
        });
        console.log('[AI] ✅ Saved\n');
    } catch (e) {
        console.error('[AI] Save failed:', e.message);
        throw e;
    }
}

export async function rerunAIAnalysis(report) {
    const url = report.media_urls?.[0];
    if (!url) throw new Error('No media on this report.');
    await processReportWithAI(
        report.report_id, url,
        report.crime_type || 'Unknown Violation',
        report.comments || ''
    );
}
