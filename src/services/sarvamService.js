// ─────────────────────────────────────────────────────────────────────────────
//  sarvamService.js  –  Unified Sarvam AI API wrapper for Delhi RoadWatch
//  Covers: STT (Saaras v3), TTS (Bulbul v3), Translation, Chat (sarvam-m)
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY = import.meta.env.VITE_SARVAM_API_KEY;

const HEADERS_JSON = {
  'Content-Type': 'application/json',
  'api-subscription-key': API_KEY,
};

// ── Endpoints ──────────────────────────────────────────────────────────────
const STT_URL = 'https://api.sarvam.ai/speech-to-text';
const TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const TRANSLATE_URL = 'https://api.sarvam.ai/translate';
const CHAT_URL = 'https://api.sarvam.ai/v1/chat/completions';

// ── Supported Languages ────────────────────────────────────────────────────
export const SUPPORTED_LANGUAGES = {
  'hi-IN': 'हिन्दी (Hindi)',
  'bn-IN': 'বাংলা (Bengali)',
  'ta-IN': 'தமிழ் (Tamil)',
  'te-IN': 'తెలుగు (Telugu)',
  'mr-IN': 'मराठी (Marathi)',
  'gu-IN': 'ગુજરાતી (Gujarati)',
  'kn-IN': 'ಕನ್ನಡ (Kannada)',
  'ml-IN': 'മലയാളം (Malayalam)',
  'pa-IN': 'ਪੰਜਾਬੀ (Punjabi)',
  'od-IN': 'ଓଡ଼ିଆ (Odia)',
  'en-IN': 'English',
};

export const LANGUAGES = Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
  code,
  name,
}));

// ── Helper ─────────────────────────────────────────────────────────────────
async function handleResponse(res) {
  if (!res.ok) {
    let msg = `Sarvam API error ${res.status}`;
    try {
      const body = await res.json();
      // API returns { error: { message: "...", code: "..." } }
      msg = body?.error?.message || body?.message || msg;
    } catch (_) { /* ignore parse error */ }
    throw new Error(msg);
  }
  return res.json();
}

// ── 1. Speech-to-Text ──────────────────────────────────────────────────────
/**
 * Transcribes an audio blob to text using Sarvam Saaras v3.
 * @param {Blob}   audioBlob  - Audio captured via MediaRecorder (WebM / WAV)
 * @param {string} langCode   - BCP-47 language code, e.g. "hi-IN"
 * @returns {Promise<{ transcript: string, language_code: string }>}
 */
export async function speechToText(audioBlob, langCode = 'hi-IN') {
  try {
    const form = new FormData();
    // Sarvam STT expects the file with a recognised audio extension
    form.append('file', audioBlob, 'recording.webm');
    form.append('model', 'saaras:v3');
    form.append('language_code', langCode);
    form.append('with_timestamps', 'false');

    const res = await fetch(STT_URL, {
      method: 'POST',
      headers: { 'api-subscription-key': API_KEY }, // no Content-Type; FormData sets it
      body: form,
    });

    const data = await handleResponse(res);
    // API returns { transcript, language_code, ... }
    return {
      transcript: data.transcript ?? '',
      language_code: data.language_code ?? langCode,
    };
  } catch (err) {
    if (err.message?.includes('fetch')) throw new Error('Sarvam AI service is unreachable. Please check your connection.');
    throw err;
  }
}

// ── 2. Text-to-Speech ──────────────────────────────────────────────────────
/**
 * Converts text to speech using Sarvam Bulbul v3.
 * @param {string} text      - Input text (max ~500 chars per call)
 * @param {string} langCode  - BCP-47 language code, e.g. "en-IN"
 * @returns {Promise<{ audioBase64: string }>}
 */
export async function textToSpeech(text, langCode = 'en-IN') {
  try {
    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: HEADERS_JSON,
      body: JSON.stringify({
        inputs: [text],
        target_language_code: langCode,
        model: 'bulbul:v2',
        enable_preprocessing: true,
      }),
    });

    const data = await handleResponse(res);
    // API returns { audios: [base64string], request_id }
    const audioBase64 = data.audios?.[0] ?? '';
    if (!audioBase64) throw new Error('No audio received from Sarvam TTS.');
    return { audioBase64 };
  } catch (err) {
    if (err.message?.includes('fetch')) throw new Error('Sarvam AI service is unreachable. Please check your connection.');
    throw err;
  }
}

// ── 3. Translation ─────────────────────────────────────────────────────────
/**
 * Translates text between Indian languages using sarvam-translate:v1.
 * @param {string} text      - Source text
 * @param {string} srcLang   - Source BCP-47 code (e.g. "en-IN"); omit for auto-detect
 * @param {string} tgtLang   - Target BCP-47 code (e.g. "hi-IN")
 * @returns {Promise<{ translated_text: string }>}
 */
export async function translateText(text, srcLang = 'auto', tgtLang = 'hi-IN') {
  try {
    const body = {
      input: text,
      source_language_code: srcLang === 'Unknown' ? 'auto' : srcLang,
      target_language_code: tgtLang,
      model: 'sarvam-translate:v1',
      enable_preprocessing: false,
    };

    const res = await fetch(TRANSLATE_URL, {
      method: 'POST',
      headers: HEADERS_JSON,
      body: JSON.stringify(body),
    });

    const data = await handleResponse(res);
    return { translated_text: data.translated_text ?? text };
  } catch (err) {
    if (err.message?.includes('fetch')) throw new Error('Sarvam AI service is unreachable. Please check your connection.');
    throw err;
  }
}

// ── 4. Indic LLM (sarvam-m) ───────────────────────────────────────────────
/**
 * Sends a conversation to Sarvam-M for legal FAQ responses.
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @returns {Promise<{ reply: string }>}
 */
export async function chatWithLegalBot(messages) {
  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: HEADERS_JSON,
      body: JSON.stringify({
        model: 'sarvam-m',
        messages,
        temperature: 0.4,
        max_tokens: 512,
      }),
    });

    const data = await handleResponse(res);
    const reply = data.choices?.[0]?.message?.content ?? 'Sorry, I could not generate a response.';
    return { reply };
  } catch (err) {
    if (err.message?.includes('fetch')) throw new Error('Sarvam AI service is unreachable. Please check your connection.');
    throw err;
  }
}

// ── Utility: Play base64 audio ────────────────────────────────────────────
/**
 * Decodes a base64 WAV string and plays it in the browser.
 * Returns the Audio object so the caller can stop/track it.
 * @param {string} base64 - Base64-encoded audio from TTS API
 * @returns {HTMLAudioElement}
 */
export function playBase64Audio(base64) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url); // cleanup
  audio.play();
  return audio;
}
