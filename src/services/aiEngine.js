import { saveAiAnalysis, updateReportStatus, STATUS, lookupVehicle } from '../data/db';
import { GoogleGenerativeAI } from "@google/generative-ai";

const ROBOFLOW_API_KEY = "EfoLlmKeF5BZCKvwshub";
const WORKFLOW_ENDPOINT = "https://serverless.roboflow.com/madhus/workflows/text-recognition";
const GEMINI_API_KEY = "AIzaSyDQoTRBPihhoyvNT3KrojvirAoiMnwpSk8";
const SIGHTENGINE_API_USER = "931483566";
const SIGHTENGINE_API_SECRET = "f75XhnAHSJpq4TxUWyFtT4xy7hJvoAXg";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Use Gemini 2.5 Pro for deep analysis and justification
const proModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
// Keep Flash as fallback
const flashModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Converts a browser File object to a Base64 string
 */
async function fileToBase64(file) {
    if (!file) return null;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

/**
 * Checks if an image is AI generated using Sightengine
 * (Your friend is working on this — keeping it as is)
 */
async function checkAiGenerated(imageFile) {
    try {
        const formData = new FormData();
        formData.append('media', imageFile);
        formData.append('models', 'genai');
        formData.append('api_user', SIGHTENGINE_API_USER);
        formData.append('api_secret', SIGHTENGINE_API_SECRET);

        const response = await fetch('https://api.sightengine.com/1.0/check.json', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            console.log("Sightengine Result:", data);
            if (data && data.type && data.type.ai_generated !== undefined) {
                return Math.floor(data.type.ai_generated * 100);
            }
        }
        return 0;
    } catch (err) {
        console.error("Sightengine Error:", err);
        return 0;
    }
}

/**
 * Calls Gemini 2.5 Pro for comprehensive violation analysis with detailed justification
 */
async function getGeminiProAnalysis(imageInput, report, needPlate = false) {
    try {
        const prompt = `You are a senior traffic violation analyst for Delhi Traffic Police. Analyze this traffic violation image with extreme precision and professionalism.

REPORTED VIOLATION TYPE: ${report.crime_type}
CITIZEN REMARKS: ${report.comments || 'None provided'}

YOUR TASKS:
1. **VIOLATION ASSESSMENT**: Carefully examine the image for evidence of "${report.crime_type}". Determine if a genuine traffic violation is visible.

2. **CONFIDENCE SCORE (0-100)**: Assign a score representing how confident you are that a real traffic violation is present.
   - 90-100: Clear, undeniable violation with strong visual evidence
   - 70-89: Likely violation but some elements are partially obscured
   - 50-69: Possible violation but image quality or angle makes it uncertain
   - 20-49: Weak evidence, violation is not clearly visible
   - 0-19: No violation detected or image is irrelevant

3. **AI COMMENTS**: Write a detailed professional analysis (60-100 words) covering:
   - What is visible in the image (vehicle type, color, road conditions, surroundings)
   - Specific evidence supporting or contradicting the reported violation
   - Why you assigned the confidence score you did
   - Any aggravating factors (school zone, heavy traffic, pedestrians at risk)
   - A final verdict sentence

${needPlate ? `4. **NUMBER PLATE**: Identify the vehicle registration number plate visible in the image. Use Indian format like "DL XX XX XXXX". If the plate is unreadable or not visible, return "NONE".` : ''}

CRITICAL: Return ONLY a valid JSON object with NO extra text before or after it.
{
  "is_valid": true/false,
  "confidence_score": <number 0-100>,
  "ai_comments": "<detailed professional analysis string>",
  "verdict": "<one of: CONFIRMED_VIOLATION | PROBABLE_VIOLATION | INSUFFICIENT_EVIDENCE | NO_VIOLATION_DETECTED>"
  ${needPlate ? ',"plate": "<plate number or NONE>"' : ''}
}`;

        const part = {
            inlineData: {
                data: imageInput,
                mimeType: "image/jpeg"
            }
        };

        // Try Pro first, fallback to Flash
        let result;
        try {
            console.log("[AI ENGINE] Calling Gemini 2.5 Pro...");
            result = await proModel.generateContent([prompt, part]);
        } catch (proErr) {
            console.warn("[AI ENGINE] Pro model failed, falling back to Flash:", proErr.message);
            result = await flashModel.generateContent([prompt, part]);
        }

        const response = await result.response;
        const text = response.text();

        console.log("[AI ENGINE] Gemini Raw Response:", text);

        // Sanitize response text to find JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
    } catch (err) {
        console.error("[AI ENGINE] Gemini Analysis Error:", err);
        return null;
    }
}

/**
 * Processes a report using:
 *   1. Roboflow for Primary OCR (number plate)
 *   2. Gemini 2.5 Pro for violation analysis + AI comments + score justification
 *   3. Sightengine for deepfake detection (your friend's part)
 *   4. Vahaan DB for vehicle registry lookup
 */
export async function processReport(report, imageFile) {
    let detectedPlate = 'PENDING';
    let roboflowConfidence = 0;
    let base64Image = null;

    try {
        if (imageFile) {
            base64Image = await fileToBase64(imageFile);

            // ──────────────────────────────────────
            // STEP 1: Roboflow OCR (Number Plate)
            // ──────────────────────────────────────
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            try {
                const response = await fetch(WORKFLOW_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: ROBOFLOW_API_KEY,
                        image: base64Image
                    }),
                    signal: controller.signal
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log("[AI ENGINE] Roboflow Raw Data:", data);

                    if (data?.outputs?.[0]) {
                        const output = data.outputs[0];
                        const ocrResults = output.ocr_results || output.predictions || [];
                        if (ocrResults.length > 0) {
                            detectedPlate = ocrResults[0].text || ocrResults[0].class || 'PENDING';
                            roboflowConfidence = Math.floor((ocrResults[0].confidence || 0) * 100);
                        }
                    }
                }
            } catch (err) {
                console.warn("[AI ENGINE] Roboflow skipped/failed:", err.message);
            } finally {
                clearTimeout(timeoutId);
            }

            // ──────────────────────────────────────
            // STEP 2: Gemini 2.5 Pro Analysis
            // (Violation score + AI comments + plate fallback)
            // ──────────────────────────────────────
            console.log("[AI ENGINE] Starting Gemini 2.5 Pro analysis...");
            const geminiResult = await getGeminiProAnalysis(
                base64Image,
                report,
                (detectedPlate === 'PENDING' || detectedPlate === 'NONE')
            );

            // ──────────────────────────────────────
            // STEP 3: Sightengine Deepfake Check
            // (Your friend is working on enhancing this)
            // ──────────────────────────────────────
            console.log("[AI ENGINE] Running Sightengine deepfake check...");
            const aiGeneratedScore = await checkAiGenerated(imageFile);

            // ──────────────────────────────────────
            // STEP 4: Compile Results
            // ──────────────────────────────────────
            let ai_summary = 'Automated analysis pending manual verification.';
            let finalConfidence = roboflowConfidence || 65;

            if (geminiResult) {
                // Build the comprehensive AI summary combining the analysis + verdict
                const verdict = geminiResult.verdict || 'ANALYSIS_COMPLETE';
                const comments = geminiResult.ai_comments || geminiResult.summary || ai_summary;

                // Create the final AI summary with the verdict tag
                ai_summary = `[${verdict}] ${comments}`;

                // Use Gemini's confidence score (it's specifically tuned to this violation)
                finalConfidence = geminiResult.confidence_score || geminiResult.score || finalConfidence;

                // Use Gemini plate if Roboflow failed
                if (detectedPlate === 'PENDING' || detectedPlate === 'NONE') {
                    if (geminiResult.plate && geminiResult.plate !== 'NONE') {
                        detectedPlate = geminiResult.plate;
                    }
                }
            }

            const finalPlate = (detectedPlate && detectedPlate !== 'PENDING' && detectedPlate !== 'NONE')
                ? detectedPlate.trim().toUpperCase().replace(/\s/g, '')
                : 'REVIEW REQUIRED';

            // ──────────────────────────────────────
            // STEP 5: Vahaan Vehicle Registry Lookup
            // ──────────────────────────────────────
            let vahaan_info = "not there in wahan";
            if (finalPlate !== 'REVIEW REQUIRED') {
                const vehicle = await lookupVehicle(finalPlate);
                if (vehicle) {
                    vahaan_info = JSON.stringify(vehicle);
                }
            }

            // ──────────────────────────────────────
            // STEP 6: Save to Database
            // ──────────────────────────────────────
            const analysisRecord = {
                report_id: report.report_id,
                ai_summary: ai_summary,
                confidence_score: finalConfidence,
                detected_vehicle_number: finalPlate,
                ai_generated_score: aiGeneratedScore,
                vahaan_status: vahaan_info
            };

            console.log("[AI ENGINE] ✅ Processing Complete:", analysisRecord);

            await saveAiAnalysis(analysisRecord);
            await updateReportStatus(report.report_id, STATUS.AI_PROCESSED);

            return analysisRecord;
        }
    } catch (error) {
        console.error("[AI ENGINE] Overall failure:", error);
    }
    return null;
}
