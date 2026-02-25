// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // 1. Handle CORS Preflight Required by Supabase Webhooks
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const payload = await req.json();

        // This function should be triggered via a Supabase Database Webhook ONLY ON INSERT to `reports`
        if (payload.type !== 'INSERT') {
            return new Response("Not an INSERT event. Skipping.", { headers: corsHeaders });
        }

        const report = payload.record;
        console.log(`[AI-ENGINE] Processing Report: ${report.report_id}`);

        if (!report.media_urls || report.media_urls.length === 0) {
            console.log("No media attached");
            return new Response("No media attached", { headers: corsHeaders });
        }

        // Environment Variables (Load these in Supabase Dashboard -> Edge Functions -> Secrets)
        const ROBOFLOW_API_KEY = Deno.env.get("ROBOFLOW_API_KEY");
        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
        const SIGHTENGINE_API_USER = Deno.env.get("SIGHTENGINE_API_USER");
        const SIGHTENGINE_API_SECRET = Deno.env.get("SIGHTENGINE_API_SECRET");

        // IMPORTANT: We will use the Anon Key since policies are open for demo
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        const imageUrl = report.media_urls[0];

        // Fetch Image Bytes for Gemini
        const imageRes = await fetch(imageUrl);
        const arrayBuffer = await imageRes.arrayBuffer();

        // Safer Base64 encoding for large image files (prevents call stack size exceeded)
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Bytes = btoa(binary);

        let detectedPlate = 'PENDING';
        let roboflowConfidence = 0;
        let aiGeneratedScore = 0;
        let finalConfidence = 65;
        let ai_summary = 'Automated analysis pending manual verification.';

        // ============================================
        // STEP 1: ROBOFLOW (Number Plate Detection)
        // ============================================
        try {
            console.log("[ROBOFLOW] Running text recognition...");
            const roboRes = await fetch("https://serverless.roboflow.com/madhus/workflows/text-recognition", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    api_key: ROBOFLOW_API_KEY,
                    inputs: { image: { type: "url", value: imageUrl } }
                })
            });
            const roboData = await roboRes.json();
            const outputs = roboData?.outputs?.[0] || roboData?.output || {};
            const ocrResults = outputs.ocr_results || outputs.predictions || outputs.results || [];

            if (Array.isArray(ocrResults) && ocrResults.length > 0) {
                detectedPlate = ocrResults[0].text || ocrResults[0].class || 'PENDING';
                roboflowConfidence = Math.floor((ocrResults[0].confidence || 0) * 100);
            }
        } catch (err) {
            console.error("[ROBOFLOW] Failed:", err.message);
        }

        // ============================================
        // STEP 2: SIGHTENGINE (Deepfake Risk Score)
        // ============================================
        try {
            console.log("[SIGHTENGINE] Running deepfake check...");
            const form = new URLSearchParams();
            form.append('api_user', SIGHTENGINE_API_USER);
            form.append('api_secret', SIGHTENGINE_API_SECRET);
            form.append('url', imageUrl); // Process highly safely via direct URL!
            form.append('models', 'genai');

            const sightRes = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: form });
            const sightData = await sightRes.json();
            if (sightData?.type?.ai_generated !== undefined) {
                aiGeneratedScore = Math.floor(sightData.type.ai_generated * 100);
            }
        } catch (err) {
            console.error("[SIGHTENGINE] Failed:", err.message);
        }

        // ============================================
        // STEP 3: GEMINI 2.0 FLASH (Violation Analysis)
        // ============================================
        try {
            console.log("[GEMINI] Running violation analysis...");
            const prompt = `You are a senior traffic violation analyst. Carefully examine the image for evidence of "${report.crime_type}".
REPORTED REMARKS: ${report.comments || 'None'}

CRITICAL: Return ONLY a valid JSON object with NO extra text before or after it.
{
  "is_valid": true/false,
  "confidence_score": <number 0-100 indicating probability of actual violation>,
  "ai_comments": "<detailed professional analysis string of 60-100 words>",
  "verdict": "<CONFIRMED_VIOLATION | PROBABLE_VIOLATION | INSUFFICIENT_EVIDENCE | NO_VIOLATION_DETECTED>"
}`;

            // Calls Gemini directly via RAW REST API to avoid NodeJS SDK limitations
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: "image/jpeg", data: base64Bytes } }
                        ]
                    }],
                    generationConfig: { temperature: 0.2 }
                })
            });

            const geminiData = await geminiRes.json();
            const textRaw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

            // Extract JSON
            let jsonString = textRaw.replace(/```json/g, '').replace(/```/g, '').trim();
            const geminiParsed = JSON.parse(jsonString);

            finalConfidence = geminiParsed.confidence_score !== undefined ? geminiParsed.confidence_score : (roboflowConfidence || 65);
            const verdict = geminiParsed.verdict || 'ANALYSIS_COMPLETE';
            ai_summary = `[${verdict}] ${geminiParsed.ai_comments || 'Analysis processed.'}`;

        } catch (err) {
            console.error("[GEMINI] Failed:", err.message);
        }

        // Finalize Plate
        const finalPlate = (detectedPlate && detectedPlate !== 'PENDING' && detectedPlate !== 'NONE')
            ? detectedPlate.trim().toUpperCase().replace(/\\s/g, '')
            : 'REVIEW REQUIRED';

        // ============================================
        // STEP 4: SAVE TO DB
        // ============================================
        console.log(`[AI-ENGINE] Result: Plate ${finalPlate}, Deepfake Risk: ${aiGeneratedScore}, Confidence: ${finalConfidence}`);
        await supabase.from('ai_analysis').insert({
            report_id: report.report_id,
            ai_summary,
            confidence_score: finalConfidence,
            detected_vehicle_number: finalPlate,
            ai_generated_score: aiGeneratedScore,
            vahaan_status: "not there in wahan"
        });

        await supabase.from('reports').update({ status: 'AI Processed' }).eq('report_id', report.report_id);

        return new Response(JSON.stringify({ success: true, report: report.report_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        console.error("Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
    }
})
