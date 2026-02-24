-- =====================================================
-- Vahaan DB Simulation — Supabase Schema + Seed Data
-- Run this in the Vahaan Supabase project SQL Editor
-- Project: vahaan-db-simulation
-- =====================================================

-- ── Vehicle Registry (simulates Vahaan / Parivahan) ──
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  number_plate TEXT UNIQUE NOT NULL,
  owner_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT,
  aadhaar TEXT,
  address TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_color TEXT,
  vehicle_type TEXT DEFAULT 'Car',
  registration_date DATE,
  insurance_valid_till DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS — open for demo
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for demo" ON vehicles FOR ALL USING (true) WITH CHECK (true);

-- ── Seed: 10 vehicles linked to the 10 civilians in delhi-roadwatch DB ──
INSERT INTO vehicles (number_plate, owner_name, phone_number, email, aadhaar, address, vehicle_make, vehicle_model, vehicle_color, vehicle_type, registration_date, insurance_valid_till) VALUES
('DL01AB1234', 'Arjun Mehra',    '9876543210', 'arjun@demo.com',    '123456789012', '12 Connaught Place, New Delhi',   'Maruti',   'Swift',       'White',  'Car',        '2022-03-15', '2026-03-14'),
('DL02CD5678', 'Priya Sharma',   '9876543211', 'priya@demo.com',    '234567890123', '45 Lajpat Nagar, New Delhi',      'Hyundai',  'i20',         'Red',    'Car',        '2021-07-20', '2025-07-19'),
('DL03EF9012', 'Rahul Singh',    '9876543212', 'rahul@demo.com',    '345678901234', '78 Rohini Sector 5, Delhi',       'Honda',    'City',        'Silver', 'Car',        '2023-01-10', '2027-01-09'),
('DL04GH3456', 'Neha Gupta',     '9876543213', 'neha@demo.com',     '456789012345', '23 Dwarka Sector 12, Delhi',      'Tata',     'Nexon',       'Blue',   'SUV',        '2022-11-05', '2026-11-04'),
('DL05IJ7890', 'Vikas Kumar',    '9876543214', 'vikas@demo.com',    '567890123456', '56 Janakpuri, New Delhi',         'Kia',      'Seltos',      'Black',  'SUV',        '2023-06-18', '2027-06-17'),
('DL06KL2345', 'Ananya Patel',   '9876543215', 'ananya@demo.com',   '678901234567', '89 Saket, New Delhi',             'Toyota',   'Fortuner',    'Grey',   'SUV',        '2021-09-22', '2025-09-21'),
('DL07MN6789', 'Deepak Verma',   '9876543216', 'deepak@demo.com',   '789012345678', '34 Pitampura, Delhi',             'Mahindra', 'XUV700',      'White',  'SUV',        '2023-04-30', '2027-04-29'),
('DL08OP1234', 'Kavita Rao',     '9876543217', 'kavita@demo.com',   '890123456789', '67 Vasant Kunj, New Delhi',       'Maruti',   'Brezza',      'Brown',  'SUV',        '2022-08-14', '2026-08-13'),
('DL09QR5678', 'Manish Jain',    '9876543218', 'manish@demo.com',   '901234567890', '90 Greater Kailash, Delhi',       'Hyundai',  'Creta',       'White',  'SUV',        '2023-02-28', '2027-02-27'),
('DL10ST9012', 'Sunita Devi',    '9876543219', 'sunita@demo.com',   '012345678901', '11 Chandni Chowk, Old Delhi',     'Honda',    'Amaze',       'Red',    'Car',        '2021-12-01', '2025-11-30');
