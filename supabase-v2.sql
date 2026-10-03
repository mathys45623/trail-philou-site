-- ============================================================
-- TRAIL PHILOU — SCRIPT SQL COMPLET (v3)
-- Idempotent : peut être relancé sans casser les données.
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  images TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE races ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- 3. TABLE STATS (une seule ligne, saisie dans le dashboard)
CREATE TABLE IF NOT EXISTS stats (
  id SERIAL PRIMARY KEY,
  total_races INTEGER DEFAULT 0,
  total_dnf INTEGER DEFAULT 0,
  total_km INTEGER DEFAULT 0,
  total_dplus INTEGER DEFAULT 0,
  years_running INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE stats ADD COLUMN IF NOT EXISTS total_dnf INTEGER DEFAULT 0;
INSERT INTO stats (total_races, total_dnf, years_running)
SELECT 0, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM stats);

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
-- FONCTIONS & TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- Un utilisateur ne peut jamais changer son propre rôle
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_role ON profiles;
CREATE TRIGGER protect_profile_role BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- Profil créé automatiquement à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_role() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ============================================================
-- SÉCURITÉ RLS
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiel ENABLE ROW LEVEL SECURITY;

-- Lecture publique
DROP POLICY IF EXISTS profiles_public_read ON profiles;
DROP POLICY IF EXISTS races_public_read ON races;
DROP POLICY IF EXISTS stats_public_read ON stats;
DROP POLICY IF EXISTS materiel_public_read ON materiel;
CREATE POLICY profiles_public_read ON profiles FOR SELECT USING (true);
CREATE POLICY races_public_read ON races FOR SELECT USING (true);
CREATE POLICY stats_public_read ON stats FOR SELECT USING (true);
CREATE POLICY materiel_public_read ON materiel FOR SELECT USING (true);

-- Profils : chacun modifie le sien (le rôle est protégé par le trigger)
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles FOR INSERT WITH CHECK (auth.uid() = id AND COALESCE(role, 'user') = 'user');
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Écriture admin seulement
DROP POLICY IF EXISTS races_admin_write ON races;
DROP POLICY IF EXISTS stats_admin_write ON stats;
DROP POLICY IF EXISTS materiel_admin_write ON materiel;
CREATE POLICY races_admin_write ON races FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY stats_admin_write ON stats FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY materiel_admin_write ON materiel FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- STORAGE (images et vidéos) : lecture publique, écriture admin
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS images_public_select ON storage.objects;
DROP POLICY IF EXISTS videos_public_select ON storage.objects;
DROP POLICY IF EXISTS media_admin_insert ON storage.objects;
DROP POLICY IF EXISTS media_admin_update ON storage.objects;
DROP POLICY IF EXISTS media_admin_delete ON storage.objects;
CREATE POLICY images_public_select ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY videos_public_select ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY media_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('images', 'videos') AND public.is_admin());
CREATE POLICY media_admin_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('images', 'videos') AND public.is_admin());
CREATE POLICY media_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('images', 'videos') AND public.is_admin());

-- ============================================================
-- Donner le rôle admin (à lancer ici, dans le SQL Editor uniquement)
-- ============================================================
-- UPDATE profiles SET role = 'admin' WHERE id = '<uuid de l''utilisateur>';
