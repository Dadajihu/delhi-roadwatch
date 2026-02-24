import { saveAiAnalysis, updateReportStatus, STATUS, lookupVehicle } from '../data/db';
import { GoogleGenerativeAI } from "@google/generative-ai";

const ROBOFLOW_API_KEY = "EfoLlmKeF5BZCKvwshub";
const WORKFLOW_ENDPOINT = "https://serverless.roboflow.com/madhus/workflows/text-recognition";
const GEMINI_API_KEY = "AIzaSyDQoTRBPihhoyvNT3KrojvirAoiMnwpSk8";
const SIGHTENGINE_API_USER = "931483566";
const SIGHTENGINE_API_SECRET = "f75XhnAHSJpq4TxUWyFtT4xy7hJvoAXg";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });

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
            // Result is a probability from 0 to 1
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
 * Calls Gemini for comprehensive analysis (Summary, Score, and optional Plate Fallback)
 */
async function getGeminiAnalysis(imageInput, report, needPlate = false) {
    try {
        const prompt = `Analyze this traffic violation image.
Violation Type: ${report.crime_type}
Location: ${report.comments}

TASKS:
1. VALIDITY: Determine if this is a clear traffic violation based on the visual evidence.
2. SUMMARY: Provide professional AI comments describing the vehicle behavior and why it constitutes a violation (max 35 words).
3. SCORE: Assign a severity/certainty score (0-100).
${needPlate ? '4. PLATE: Identify the vehicle number plate. Format: "DL XX XX XXXX". If unreadable, return "NONE".' : ''}

CRITICAL: Return ONLY a valid JSON object.
Structure:
{
  "is_valid": true/false,
  "summary": "...",
  "score": 0,
  ${needPlate ? '"plate": "..."' : ''}
}`;

        const part = {
            inlineData: {
                data: imageInput,
                mimeType: "image/jpeg"
            }
        };

        const result = await model.generateContent([prompt, part]);
        const response = await result.response;
        const text = response.text();

        console.log("Gemini Raw Response:", text);

        // Sanitize response text to find JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
    } catch (err) {
        console.error("Gemini Analysis Error:", err);
        return null;
    }
}

/**
 * Processes a report using Roboflow for Primary OCR and Gemini for Logic/Fallback
 */
export async function processReport(report, imageFile) {
    let detectedPlate = 'PENDING';
    let roboflowConfidence = 0;
    let base64Image = null;

    try {
        if (imageFile) {
            base64Image = await fileToBase64(imageFile);

            // 1. Roboflow Attempt
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
                    console.log("Roboflow Raw Data:", data);

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
                console.warn("Roboflow skipped/failed:", err.message);
            } finally {
                clearTimeout(timeoutId);
            }

            // 2. Gemini Analysis (Always for Summary/Score, Fallback for Plate)
            const geminiResult = await getGeminiAnalysis(base64Image, report, (detectedPlate === 'PENDING' || detectedPlate === 'NONE'));

            // 3. Sightengine Check (AI Generation Detection)
            const aiGeneratedScore = await checkAiGenerated(imageFile);

            let ai_summary = 'Automated analysis pending manual verification.';
            let finalConfidence = roboflowConfidence || 65;

            if (geminiResult) {
                ai_summary = geminiResult.summary || ai_summary;
                finalConfidence = geminiResult.score || finalConfidence;

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

            // 4. Vahaan Check
            let vahaan_info = "not there in wahan";
            if (finalPlate !== 'REVIEW REQUIRED') {
                const vehicle = await lookupVehicle(finalPlate);
                if (vehicle) {
                    vahaan_info = JSON.stringify(vehicle);
                }
            }

            const analysisRecord = {
                report_id: report.report_id,
                ai_summary: ai_summary,
                confidence_score: finalConfidence,
                detected_vehicle_number: finalPlate,
                ai_generated_score: aiGeneratedScore,
                // We'll store vahaan info in the summary or a new field if we updated schema
                // For now, let's append it to summary or store it as is if schema allows
                vahaan_status: vahaan_info
            };

            console.log("AI Engine Processing Complete:", analysisRecord);

            await saveAiAnalysis(analysisRecord);
            await updateReportStatus(report.report_id, STATUS.AI_PROCESSED);

            return analysisRecord;
        }
    } catch (error) {
        console.error("AI Engine overall failure:", error);
    }
    return null;
}

