-- ============================================================
-- TRAIL PHILOU V2 — SCRIPT SQL COMPLET
-- Coller dans Supabase > SQL Editor > New Query
-- ============================================================

-- 1. TABLE PROFILS
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  bio TEXT,
  hero_title TEXT,
  photo_url TEXT,
  tags TEXT,
  years_running INTEGER,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLE COURSES (upcoming + past)
CREATE TABLE IF NOT EXISTS races (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  location TEXT,
  distance NUMERIC,
  dplus INTEGER,
  race_type TEXT DEFAULT 'trail',
  type TEXT NOT NULL CHECK (type IN ('upcoming', 'past')),
  status TEXT DEFAULT 'objectif',
  finish_time TEXT,
  rank TEXT,
  notes TEXT,
  image_url TEXT,
  videos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLE STATS
CREATE TABLE IF NOT EXISTS stats (
  id SERIAL PRIMARY KEY,
  total_races INTEGER DEFAULT 0,
  total_km INTEGER DEFAULT 0,
  total_dplus INTEGER DEFAULT 0,
  years_running INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO stats (total_races, total_km, total_dplus, years_running)
VALUES (0, 0, 0, 0) ON CONFLICT DO NOTHING;

-- 4. TABLE MATÉRIEL
CREATE TABLE IF NOT EXISTS materiel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  categorie TEXT,
  marque TEXT,
  description TEXT,
  avis TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SÉCURITÉ RLS
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiel ENABLE ROW LEVEL SECURITY;

-- Lecture publique partout
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "races_read" ON races FOR SELECT USING (true);
CREATE POLICY "stats_read" ON stats FOR SELECT USING (true);
CREATE POLICY "materiel_read" ON materiel FOR SELECT USING (true);

-- Écriture admin seulement
CREATE POLICY "profiles_write" ON profiles FOR ALL USING (auth.uid() = id);

CREATE POLICY "races_write" ON races FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
CREATE POLICY "stats_write" ON stats FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
CREATE POLICY "materiel_write" ON materiel FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- ============================================================
-- STORAGE (buckets pour images et vidéos)
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT DO NOTHING;

CREATE POLICY "images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "images_admin_write" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'images' AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "videos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY "videos_admin_write" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'videos' AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- ============================================================
-- Mettre votre profil admin (remplacez l'ID par le vôtre)
-- ============================================================
-- UPDATE profiles SET role = 'admin' WHERE id = '9b158625-b53e-4f26-8785-5df7322c2d26';
-- (décommentez et exécutez cette ligne séparément)
