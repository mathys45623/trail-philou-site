// Appelée chaque jour par le cron Vercel (voir vercel.json).
// Une petite requête suffit à garder le projet Supabase gratuit actif :
// sans activité pendant 7 jours, il se met en pause et le site ne charge plus rien.
const SUPABASE_URL = 'https://yhkbpshmhtqznduwhcrj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inloa2Jwc2htaHRxem5kdXdoY3JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTk5MjUsImV4cCI6MjA5ODEzNTkyNX0.lY_h5h1RZZsCbgYHA-Ju3K2YTpwXvtwBo-LgZpQhynU';

module.exports = async (req, res) => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/stats?select=id&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
