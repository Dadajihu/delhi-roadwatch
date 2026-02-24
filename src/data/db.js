/* ──────────────────────────────────────────────
   Delhi RoadWatch — Database Layer (Supabase)
   Replaces old in-memory db.js
   ────────────────────────────────────────────── */

import { supabase, vahaanDb } from '../lib/supabase';

// ── Constants ──
export const CRIME_TYPES = [
  'Signal Jumping',
  'Illegal Parking',
  'No Helmet',
  'Triple Riding',
  'Wrong Side Driving',
  'Overspeeding',
  'Dangerous Driving',
  'Blocking Road',
  'Other',
];

export const STATUS = {
  SUBMITTED: 'Submitted',
  AI_PROCESSED: 'AI Processed',
  ADMIN_ACCEPTED: 'Admin Accepted',
  ADMIN_REJECTED: 'Admin Rejected',
  POLICE_CONFIRMED: 'Police Confirmed',
  OWNER_NOTIFIED: 'Owner Notified',
};

// ── Report ID generator ──
let _counter = Date.now();
export function nextReportId() {
  return `RPT-${++_counter}`;
}

// ═══════════════════════════════════════
//  AUTH QUERIES
// ═══════════════════════════════════════

export async function loginCitizen(email, password) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('password_hash', password)
    .single();
  if (error || !data) return { success: false, error: 'Invalid email or password.' };
  return { success: true, user: { ...data, role: 'citizen', user_id: data.user_id } };
}

export async function loginPolice(policeId, password) {
  const { data, error } = await supabase
    .from('police')
    .select('*')
    .eq('police_id', policeId)
    .eq('password_hash', password)
    .single();
  if (error || !data) return { success: false, error: 'Invalid Police ID or password.' };
  return { success: true, user: { ...data, role: 'police', user_id: data.police_id } };
}

export async function loginAdmin(adminId, password) {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('admin_id', adminId)
    .eq('password_hash', password)
    .single();
  if (error || !data) return { success: false, error: 'Invalid Admin ID or password.' };
  return { success: true, user: { ...data, role: 'admin', user_id: data.admin_id } };
}

export async function signupCitizen(name, email, phone, aadhaar, password) {
  // Check if email exists
  const { data: existing } = await supabase.from('users').select('user_id').eq('email', email).single();
  if (existing) return { success: false, error: 'Email already registered.' };

  const { data, error } = await supabase.from('users').insert({
    role: 'citizen',
    name, email, phone,
    aadhaar: aadhaar,
    aadhaar_verified: true,
    password_hash: password,
  }).select().single();

  if (error) return { success: false, error: error.message };
  return { success: true, user: { ...data, role: 'citizen', user_id: data.user_id } };
}

// ═══════════════════════════════════════
//  REPORT QUERIES
// ═══════════════════════════════════════

export async function createReport(report) {
  const { data, error } = await supabase.from('reports').insert(report).select().single();
  if (error) throw error;

  // Also create case_status row
  await supabase.from('case_status').insert({
    report_id: report.report_id,
    admin_status: report.reported_by === 'police' ? 'accepted' : null,
    police_status: report.reported_by === 'police' ? 'confirmed' : null,
    notification_sent: false,
  });

  return data;
}

export async function fetchReports(filters = {}) {
  let query = supabase.from('reports').select('*').order('submission_time', { ascending: false });
  if (filters.citizen_id) query = query.eq('citizen_id', filters.citizen_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.reported_by) query = query.eq('reported_by', filters.reported_by);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateReportStatus(reportId, newStatus) {
  const { error } = await supabase.from('reports').update({ status: newStatus }).eq('report_id', reportId);
  if (error) throw error;
}

export async function deleteReport(reportId) {
  // Delete dependent rows first (FK constraints)
  await supabase.from('ai_analysis').delete().eq('report_id', reportId);
  await supabase.from('case_status').delete().eq('report_id', reportId);
  await supabase.from('notifications').delete().eq('report_id', reportId);
  const { error } = await supabase.from('reports').delete().eq('report_id', reportId);
  if (error) throw error;
}

// ═══════════════════════════════════════
//  AI ANALYSIS QUERIES
// ═══════════════════════════════════════

export async function saveAiAnalysis(analysis) {
  const { data, error } = await supabase.from('ai_analysis').insert(analysis).select().single();
  if (error) throw error;
  return data;
}

export async function fetchAiAnalysis(reportId) {
  const { data } = await supabase.from('ai_analysis').select('*').eq('report_id', reportId).single();
  return data;
}

export async function fetchAllAiAnalysis() {
  const { data } = await supabase.from('ai_analysis').select('*');
  return data || [];
}

// ═══════════════════════════════════════
//  VAHAAN DB QUERIES (separate project)
// ═══════════════════════════════════════

export async function lookupVehicle(numberPlate) {
  const { data, error } = await vahaanDb
    .from('vehicles')
    .select('*')
    .eq('number_plate', numberPlate)
    .single();
  if (error || !data) return null;
  return data;
}

export async function fetchAllVehicles() {
  const { data } = await vahaanDb.from('vehicles').select('*');
  return data || [];
}

// ═══════════════════════════════════════
//  CASE STATUS QUERIES
// ═══════════════════════════════════════

export async function updateCaseStatus(reportId, updates) {
  const { error } = await supabase.from('case_status').update({ ...updates, updated_at: new Date().toISOString() }).eq('report_id', reportId);
  if (error) throw error;
}

// ═══════════════════════════════════════
//  NOTIFICATION QUERIES
// ═══════════════════════════════════════

export async function createNotification(notification) {
  const { data, error } = await supabase.from('notifications').insert(notification).select().single();
  if (error) throw error;
  return data;
}

export async function fetchNotifications() {
  const { data } = await supabase.from('notifications').select('*').order('sent_at', { ascending: false });
  return data || [];
}

// ═══════════════════════════════════════
//  VIOLATIONS QUERIES (shown to violators)
// ═══════════════════════════════════════

export async function createViolation(violation) {
  const { data, error } = await supabase.from('violations').insert(violation).select().single();
  if (error) throw error;
  return data;
}

export async function fetchViolationsForUser(phone) {
  const { data } = await supabase.from('violations').select('*').eq('violator_phone', phone).order('created_at', { ascending: false });
  return data || [];
}

export async function fetchViolationsByEmail(email) {
  // Look up user phone by email first, then get violations
  const { data: user } = await supabase.from('users').select('phone').eq('email', email).single();
  if (!user) return [];
  return fetchViolationsForUser(user.phone);
}
