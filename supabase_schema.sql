-- =====================================================
-- Delhi RoadWatch — Supabase Schema + Seed Data
-- =====================================================

-- ── 0. CREATE STORAGE BUCKET FOR DIGITAL EVIDENCE ──
insert into storage.buckets (id, name, public) 
values ('evidence', 'evidence', true) 
ON CONFLICT (id) DO NOTHING;

-- Allow public uploads and reads for demo
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Allow public downloads" on storage.objects;
create policy "Allow public uploads" on storage.objects for insert with check (bucket_id = 'evidence');
create policy "Allow public downloads" on storage.objects for select using (bucket_id = 'evidence');

-- ── 1. USERS TABLE (Citizens) ──
CREATE TABLE IF NOT EXISTS users (
  user_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen', 'admin', 'police')),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  aadhaar TEXT,
  aadhaar_verified BOOLEAN DEFAULT false,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. POLICE TABLE ──
CREATE TABLE IF NOT EXISTS police (
  police_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 3. ADMINS TABLE ──
CREATE TABLE IF NOT EXISTS admins (
  admin_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. REPORTS TABLE ──
CREATE TABLE IF NOT EXISTS reports (
  report_id TEXT PRIMARY KEY,
  citizen_id TEXT NOT NULL,
  reported_by TEXT DEFAULT 'citizen' CHECK (reported_by IN ('citizen', 'police')),
  media_urls TEXT[] DEFAULT '{}',
  crime_type TEXT NOT NULL,
  comments TEXT,
  number_plate TEXT,
  status TEXT NOT NULL DEFAULT 'Submitted',
  submission_time TIMESTAMPTZ DEFAULT now()
);

-- ── 5. AI ANALYSIS TABLE ──
CREATE TABLE IF NOT EXISTS ai_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id TEXT REFERENCES reports(report_id),
  ai_summary TEXT,
  confidence_score INTEGER,
  ai_generated_score INTEGER DEFAULT 0,
  detected_vehicle_number TEXT,
  vahaan_status TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

-- ── 6. VEHICLE REGISTRY ──
-- NOTE: Vehicle registry lives in the SEPARATE Vahaan DB project
-- (vahaan-db-simulation / nibajbylccmzluppaesk.supabase.co)
-- See vahaan_schema.sql for that schema.


-- ── 7. CASE STATUS TABLE ──
CREATE TABLE IF NOT EXISTS case_status (
  report_id TEXT PRIMARY KEY REFERENCES reports(report_id),
  admin_status TEXT,
  police_status TEXT,
  notification_sent BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 8. NOTIFICATIONS TABLE ──
CREATE TABLE IF NOT EXISTS notifications (
  notif_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id TEXT REFERENCES reports(report_id),
  target_user_id TEXT,
  owner_name TEXT,
  phone_number TEXT,
  number_plate TEXT,
  message TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  read BOOLEAN DEFAULT false
);

-- ── 9. VIOLATIONS TABLE (shown to violators on their account) ──
CREATE TABLE IF NOT EXISTS violations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id TEXT REFERENCES reports(report_id),
  violator_phone TEXT NOT NULL,
  violator_name TEXT,
  number_plate TEXT NOT NULL,
  crime_type TEXT NOT NULL,
  status TEXT DEFAULT 'Pending',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- DISABLE RLS FOR DEMO (enable in production)
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE police ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis ENABLE ROW LEVEL SECURITY;
-- vehicle_registry is in Vahaan DB (separate project)
ALTER TABLE case_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;

-- Allow all operations for demo (anon key)
DROP POLICY IF EXISTS "Allow all for demo" ON users;
CREATE POLICY "Allow all for demo" ON users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for demo" ON police;
CREATE POLICY "Allow all for demo" ON police FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for demo" ON admins;
CREATE POLICY "Allow all for demo" ON admins FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for demo" ON reports;
CREATE POLICY "Allow all for demo" ON reports FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for demo" ON ai_analysis;
CREATE POLICY "Allow all for demo" ON ai_analysis FOR ALL USING (true) WITH CHECK (true);

-- vehicle_registry policy is in Vahaan DB (separate project)

DROP POLICY IF EXISTS "Allow all for demo" ON case_status;
CREATE POLICY "Allow all for demo" ON case_status FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for demo" ON notifications;
CREATE POLICY "Allow all for demo" ON notifications FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for demo" ON violations;
CREATE POLICY "Allow all for demo" ON violations FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- SEED DATA — 10 civilians, 10 police, 10 admins
-- =====================================================

-- ── 10 Civilians ──
-- Test credential shown on login: arjun@demo.com / citizen123
INSERT INTO users (role, name, email, phone, aadhaar, aadhaar_verified, password_hash) VALUES
('citizen', 'Arjun Mehra',    'arjun@demo.com',    '9876543210', '123456789012', true, 'citizen123'),
('citizen', 'Priya Sharma',   'priya@demo.com',    '9876543211', '234567890123', true, 'citizen123'),
('citizen', 'Rahul Singh',    'rahul@demo.com',    '9876543212', '345678901234', true, 'citizen123'),
('citizen', 'Neha Gupta',     'neha@demo.com',     '9876543213', '456789012345', true, 'citizen123'),
('citizen', 'Vikas Kumar',    'vikas@demo.com',    '9876543214', '567890123456', true, 'citizen123'),
('citizen', 'Ananya Patel',   'ananya@demo.com',   '9876543215', '678901234567', true, 'citizen123'),
('citizen', 'Deepak Verma',   'deepak@demo.com',   '9876543216', '789012345678', true, 'citizen123'),
('citizen', 'Kavita Rao',     'kavita@demo.com',   '9876543217', '890123456789', true, 'citizen123'),
('citizen', 'Manish Jain',    'manish@demo.com',   '9876543218', '901234567890', true, 'citizen123'),
('citizen', 'Sunita Devi',    'sunita@demo.com',   '9876543219', '012345678901', true, 'citizen123')
ON CONFLICT DO NOTHING;

-- ── 10 Police ──
-- Test credential shown on login: POL001 / police123
INSERT INTO police (police_id, name, phone, email, password_hash) VALUES
('POL001', 'Inspector Rajesh Verma',     '9911000001', 'rajesh.pol@demo.com',  'police123'),
('POL002', 'SI Kavita Rao',              '9911000002', 'kavita.pol@demo.com',  'police123'),
('POL003', 'Inspector Anil Sharma',      '9911000003', 'anil.pol@demo.com',    'police123'),
('POL004', 'SI Meena Kumari',            '9911000004', 'meena.pol@demo.com',   'police123'),
('POL005', 'Inspector Suresh Yadav',     '9911000005', 'suresh.pol@demo.com',  'police123'),
('POL006', 'SI Pooja Singh',             '9911000006', 'pooja.pol@demo.com',   'police123'),
('POL007', 'Inspector Vikram Chauhan',   '9911000007', 'vikram.pol@demo.com',  'police123'),
('POL008', 'SI Ritu Malhotra',           '9911000008', 'ritu.pol@demo.com',    'police123'),
('POL009', 'Inspector Kiran Bedi',       '9911000009', 'kiran.pol@demo.com',   'police123'),
('POL010', 'SI Arjun Kapoor',            '9911000010', 'arjun.pol@demo.com',   'police123')
ON CONFLICT DO NOTHING;

-- ── 10 Admins ──
-- Test credential shown on login: ADM001 / admin123
INSERT INTO admins (admin_id, name, email, password_hash) VALUES
('ADM001', 'Admin Suresh Iyer',      'suresh.adm@demo.com',   'admin123'),
('ADM002', 'Admin Rekha Mishra',     'rekha.adm@demo.com',    'admin123'),
('ADM003', 'Admin Vijay Nair',       'vijay.adm@demo.com',    'admin123'),
('ADM004', 'Admin Geeta Pandey',     'geeta.adm@demo.com',    'admin123'),
('ADM005', 'Admin Mohit Saxena',     'mohit.adm@demo.com',    'admin123'),
('ADM006', 'Admin Shalini Desai',    'shalini.adm@demo.com',  'admin123'),
('ADM007', 'Admin Prakash Joshi',    'prakash.adm@demo.com',  'admin123'),
('ADM008', 'Admin Nandini Reddy',    'nandini.adm@demo.com',  'admin123'),
('ADM009', 'Admin Amit Tiwari',      'amit.adm@demo.com',     'admin123'),
('ADM010', 'Admin Divya Kapoor',     'divya.adm@demo.com',    'admin123')
ON CONFLICT DO NOTHING;

-- Vehicle Registry seed data is in Vahaan DB (see vahaan_schema.sql)

