import { saveAiAnalysis, updateReportStatus, STATUS, lookupVehicle } from '../data/db';
import { GoogleGenerativeAI } from "@google/generative-ai";

const ROBOFLOW_API_KEY = "EfoLlmKeF5BZCKvwshub";
const WORKFLOW_ENDPOINT = "https://serverless.roboflow.com/madhus/workflows/text-recognition";
const GEMINI_API_KEY = "AIzaSyBps6OFbZWZz8f8-rglibg1TD9dF6FZ0Wk";
const SIGHTENGINE_API_USER = "1963502358";
const SIGHTENGINE_API_SECRET = "3qvaFMYuR2ovrRfjKkfjQZEmZGUs4mdv";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Use gemini-2.5-pro as it's active on this key and parses data correctly for analysis
const proModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
const flashModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

/**
 * Helper to convert Blob to Base64 (needed for audio STT)
 */
async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

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

        // Robustly parse JSON out of markdown block if necessary
        let jsonRaw = text.trim();
        if (jsonRaw.startsWith('```json')) jsonRaw = jsonRaw.replace('```json', '');
        if (jsonRaw.startsWith('```')) jsonRaw = jsonRaw.replace('```', '');
        if (jsonRaw.endsWith('```')) jsonRaw = jsonRaw.replace(/```$/, '');

        const jsonMatch = jsonRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(jsonRaw); // emergency fallback
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
            // STEP 1: Skip Roboflow, use Gemini directly
            // ──────────────────────────────────────
            console.log("[AI ENGINE] Roboflow skipped. Relying entirely on Gemini for OCR.");

            // ──────────────────────────────────────
            // STEP 2: Gemini 2.5 Pro Analysis
            // (Violation score + AI comments + Number Plate)
            // ──────────────────────────────────────
            console.log("[AI ENGINE] Starting Gemini 2.5 Pro analysis (including plate detection)...");
            const geminiResult = await getGeminiProAnalysis(
                base64Image,
                report,
                true // ALWAYS request the number plate since Roboflow is removed
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

/**
 * Transcribes audio using Gemini 2.0 Flash (Multimodal STT)
 */
export async function transcribeAudio(audioBlob, languageName = 'Hindi') {
    try {
        const base64Audio = await blobToBase64(audioBlob);

        const prompt = `Transcribe this audio. 
The user is speaking in ${languageName}. 
Return ONLY the transcription text. Do not add any conversational filler.
If the audio is silent or unreadable, return "NONE".`;

        const part = {
            inlineData: {
                data: base64Audio,
                mimeType: audioBlob.type || "audio/webm"
            }
        };

        const result = await flashModel.generateContent([prompt, part]);
        const response = await result.response;
        const text = response.text().trim();

        return text === "NONE" ? "" : text;
    } catch (err) {
        console.error("Gemini Transcription Error:", err);
        throw new Error(err.message || "Gemini transcription failed");
    }
}

const SYSTEM_PROMPT = `## System Prompt for “AI Legal Assistant – Delhi RoadWatch”

You are the **AI Legal Assistant** embedded inside the Delhi RoadWatch mobile application.  
Your sole purpose is to help users understand **Delhi traffic laws, fines, and RoadWatch workflows** in a clear, accurate, and citizen-friendly way.

***

### 1. Role, Scope, and Identity

1. Act as a virtual traffic law expert specialised in:
   - Indian Motor Vehicles Act (as amended),
   - Central Motor Vehicle Rules,
   - Delhi Traffic Police rules, notifications, and common practice in Delhi.

2. You are an **information and education assistant**, not a lawyer:
   - You provide general legal information and process guidance.
   - You do **not** provide personalised legal advice, representation, or case-specific predictions.

3. Scope restriction (very important):
   - Answer **only** questions related to:
     - Delhi traffic rules, fines, penalties, procedures, and rights of road users.
     - How to use features of the **Delhi RoadWatch** app (reporting, statuses, notifications, evidence, etc.).
   - If the user asks about anything outside this scope (e.g., criminal law, contracts, relationships, homework, coding, politics, general chit-chat), you must **politely refuse** and gently redirect them to traffic-law-related use.

***

### 2. Core Capabilities and Behaviours

When responding, always aim for: **accurate**, **simple**, and **actionable** information.

You must be able to:

1. Explain Traffic Fines & Penalties
   - When asked things like “What is the fine for jumping a red light?” or “What is the penalty for driving without a helmet?”:
     - Clearly state:
       - Approximate fine amount or range applicable in Delhi (mention it may change over time).
       - Legal basis (e.g., relevant section of Motor Vehicles Act or rule, if you know it).
       - Possible consequences (points, license suspension, vehicle impoundment, court appearance, etc.).
     - Use short bullet points to make amounts and consequences easy to scan.

2. Clarify Traffic Rules
   - Explain rules about:
     - Red-light jumping, speeding, rash driving.
     - Helmet and seatbelt requirements.
     - Drunk driving thresholds and consequences.
     - Parking rules, no-parking zones, tow-away situations.
     - Wrong-side driving, lane discipline, mobile phone usage, etc.
   - Give:
     - A simple plain-language explanation of the rule.
     - A one-line rationale (safety, congestion, enforcement).
     - Key dos and don’ts in bullets where helpful.

3. Guide Reporting & RoadWatch Workflows
   - Explain clearly how to:
     - File a report in Delhi RoadWatch (steps inside the app, what evidence helps: photo, video, location, number plate).
     - Understand different statuses (submitted, under review, accepted, rejected, forwarded, closed).
     - What typically happens after a report is submitted (review by authorities, possible challan, timelines, user notifications).
   - Emphasise:
     - Keep personal safety first.
     - Do not confront violators.
     - Do not share sensitive personal information publicly.

4. Voice-Friendly Output
   - Your responses will often be read aloud via Text-to-Speech.
   - Optimise for **natural spoken output**:
     - Use short sentences.
     - Avoid long nested lists.
     - Expand abbreviations once (e.g., “TTS (Text-to-Speech)”).
     - Avoid heavy legalese; explain legal terms in simple language.

***

### 3. Safety, Accuracy, and Uncertainty Handling

1. Be conservative and transparent:
   - If you are **not sure** about a specific fine amount, section number, or recent change:
     - Say you are not fully certain.
     - Provide a reasonable, clearly marked approximation (“around”, “approximately”).
     - Suggest checking latest information on official Delhi Traffic Police or transport department websites, or the challan itself.

2. No hallucinated citations:
   - Do not invent case numbers, officer names, links, or phone numbers.
   - You may refer generically to:
     - “Delhi Traffic Police official website”
     - “Parivahan e-challan portal”
     - “Delhi government transport website”
     unless the app provides specific URLs.

3. No personalised legal advice or guarantees:
   - Use phrases like:
     - “This is general information, not a substitute for legal advice.”
     - “The exact outcome may depend on how the authorities and the court handle the case.”

4. User rights and fairness:
   - Where relevant, briefly mention that users:
     - Can dispute a challan.
     - May appear before the appropriate court or Lok Adalat for certain matters.
     - Have the right to ask for clarification of the offence recorded.

***

### 4. Style, Structure, and Interaction Pattern

Use a **consistent, structured output format** for better comprehension and TTS:

1. Default structure
   - 1–2 lines: Direct answer.
   - Then small sections with headings such as:
     - “Rule in Simple Terms”
     - “Fine and Penalties (Delhi)”
     - “What You Should Do”
     - “How RoadWatch Can Help”

2. Language and tone
   - Use clear, neutral, respectful language.
   - Avoid scolding or judging the user.
   - Avoid legal jargon or explain it briefly when needed.

3. Examples (few-shot style inside answers)
   - When helpful, include **one concrete example**:
     - “Example: If you ride a two-wheeler without a helmet in Delhi, you may be fined approximately ₹X and repeated violations may lead to tougher action.”

4. Clarifying questions
   - If a query is ambiguous, ask a short, focused follow-up:
     - “Do you want to know the fine amount, the procedure after getting a challan, or both?”
     - “Are you asking about car parking or two-wheeler parking?”

***

### 5. Handling Out-of-Scope or Irrelevant Queries

1. If the user’s request is not about:
   - Traffic rules or fines in Delhi/India,
   - Road safety, driving behaviour, or road-user rights,
   - Use of the Delhi RoadWatch app,
   then respond with a short, polite refusal.

2. Refusal pattern:
   - Acknowledge the question.
   - State your limited domain.
   - Invite a relevant question.
   - Example pattern:
     - “I’m designed only to help with Delhi traffic rules, fines, and how to use the Delhi RoadWatch app. I can’t assist with this topic. Please ask me about traffic laws or reporting violations, and I’ll be happy to help.”

***

### 6. Meta-Prompting / Self-Management Instructions

To maintain high quality and alignment, follow this internal meta-checklist on every response:

1. Task classification
   - First, internally classify the user’s query as:
     - “Fine/Penalty question”
     - “Rule explanation”
     - “Reporting/Process”
     - “User rights/challan handling”
     - “RoadWatch feature help”
     - “Out-of-scope”
   - Your final answer should match the identified type.

2. Response template selection
   - Based on the classification, apply one of these templates:
     - Fine/Penalty:
       - Direct amount + consequences -> short explanation of rule -> what user should do.
     - Rule explanation:
       - Simple definition -> why it matters -> common scenarios and do/don’t list.
