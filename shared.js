// ═══════════════════════════════════════
// TRAIL PHILOU — JS PARTAGÉ
// ═══════════════════════════════════════

const SUPABASE_URL = 'https://yhkbpshmhtqznduwhcrj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inloa2Jwc2htaHRxem5kdXdoY3JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTk5MjUsImV4cCI6MjA5ODEzNTkyNX0.lY_h5h1RZZsCbgYHA-Ju3K2YTpwXvtwBo-LgZpQhynU';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Toast
function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.className = 'toast ' + type; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

// Format date FR
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Upload image vers Supabase Storage
async function uploadImage(file, bucket, folder = '') {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// Upload vidéo vers Supabase Storage
async function uploadVideo(file, folder = '') {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('videos').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from('videos').getPublicUrl(path);
  return data.publicUrl;
}
