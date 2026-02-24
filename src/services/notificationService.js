/* ──────────────────────────────────────────────
   Delhi RoadWatch — Notification Service (Supabase + Gemini AI)
   ────────────────────────────────────────────── */

import {
    lookupVehicle,
    createNotification,
    createViolation,
    updateCaseStatus,
    updateReportStatus,
    STATUS,
} from '../data/db';
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = "AIzaSyDQoTRBPihhoyvNT3KrojvirAoiMnwpSk8";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });

async function generatePersonalizedMessage(ownerName, numberPlate, crimeType, reportId) {
    try {
        const prompt = `Generate a very professional, official, and authoritative traffic violation notice for a vehicle owner in New Delhi.
Direct it to: ${ownerName}
Vehicle: ${numberPlate}
Violation: ${crimeType}
Case ID: ${reportId}

Tone: Serious, formal, but not aggressive. Mention that it has been verified by Delhi RoadWatch AI and Traffic Authorities.
Include a call to action to check the portal for evidence.
Max 50 words.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (err) {
        console.error("Gemini Notification Error:", err);
        return `A traffic violation involving your vehicle (${numberPlate}) has been verified. Case ID: ${reportId}. Please check the RoadWatch portal for details.`;
    }
}

export async function notifyOwner(reportId, numberPlate, crimeType) {
    // Look up vehicle in Vahaan DB
    const vehicle = await lookupVehicle(numberPlate);

    const ownerName = vehicle?.owner_name || 'Vehicle Owner';
    const phoneNumber = vehicle?.phone_number || 'Unknown';

    // Generate AI Message
    const message = await generatePersonalizedMessage(ownerName, numberPlate, crimeType, reportId);

    // Save notification
    const notification = await createNotification({
        report_id: reportId,
        target_user_id: phoneNumber,
        owner_name: ownerName,
        phone_number: phoneNumber,
        number_plate: numberPlate,
        message,
    });

    // Create violation record (visible to violator on login)
    await createViolation({
        report_id: reportId,
        violator_phone: phoneNumber,
        violator_name: ownerName,
        number_plate: numberPlate,
        crime_type: crimeType || 'Traffic Violation',
        status: 'Pending',
        message,
    });

    // Update case status
    await updateCaseStatus(reportId, { notification_sent: true });
    await updateReportStatus(reportId, STATUS.OWNER_NOTIFIED);

    return notification;
}
