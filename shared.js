// ═══════════════════════════════════════
// TRAIL TEAM — JS PARTAGÉ
// Client Supabase, helpers, menu et connexion communs à toutes les pages.
// ═══════════════════════════════════════

const SUPABASE_URL = 'https://yhkbpshmhtqznduwhcrj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inloa2Jwc2htaHRxem5kdXdoY3JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTk5MjUsImV4cCI6MjA5ODEzNTkyNX0.lY_h5h1RZZsCbgYHA-Ju3K2YTpwXvtwBo-LgZpQhynU';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── HELPERS ───

// Échappe le texte avant de l'injecter dans du HTML
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Normalise une colonne tableau (text[], JSON ou chaîne "{a,b}") en vrai tableau
function toArr(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (!v) return [];
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(Boolean) : []; }
    catch { return v.replace(/[{}"]/g, '').split(',').map(s => s.trim()).filter(Boolean); }
  }
  return [];
}

// Les colonnes DATE arrivent en "YYYY-MM-DD" : on les lit en heure locale
function parseDate(d) {
  if (!d) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
}
function fmtDate(d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const dt = parseDate(d);
  return dt ? dt.toLocaleDateString('fr-FR', opts) : '—';
}
function daysUntil(d) {
  const dt = parseDate(d); if (!dt) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((dt - today) / 86400000);
}
function fmtNum(n) { return Number(n || 0).toLocaleString('fr-FR'); }

// Totaux = historique « avant le site » (dashboard) + courses terminées enregistrées.
// Les abandons (dnf) comptent comme départs, pas dans les km / D+.
function computeTotals(stats, pastRaces = []) {
  const done = pastRaces.filter(r => !r.dnf);
  const sum = k => done.reduce((a, r) => a + (+r[k] || 0), 0);
  const fin = (stats?.races_before || 0) + done.length;
  const dnf = (stats?.dnf_before || 0) + (pastRaces.length - done.length);
  return {
    fin, dnf, total: fin + dnf,
    km: (stats?.km_before || 0) + Math.round(sum('distance')),
    dplus: (stats?.dplus_before || 0) + sum('dplus'),
    years: stats?.start_year ? Math.max(0, new Date().getFullYear() - stats.start_year) : 0,
  };
}

// Totaux de plusieurs coureurs (ou d'un seul) à partir de leurs courses terminées
function teamTotals(runners, pastRaces, only = null) {
  const t = { fin: 0, dnf: 0, total: 0, km: 0, dplus: 0, years: 0 };
  (only ? [only] : runners).forEach(r => {
    const x = computeTotals(r, pastRaces.filter(c => c.runner_id === r.id));
    for (const k in t) t[k] = k === 'years' ? Math.max(t[k], x[k]) : t[k] + x[k];
  });
  return t;
}

function fmtRelative(d) {
  const s = (new Date(d) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  for (const [unit, sec] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), unit);
  }
  return 'à l\'instant';
}

const RACE_TYPES = { trail: 'Trail', ultra: 'Ultra', sky: 'Skyrace', route: 'Route' };
const STATUS = {
  objectif:  { label: '🎯 Objectif',  cls: 'status-objectif' },
  inscrit:   { label: '✅ Inscrit',   cls: 'status-inscrit' },
  selection: { label: '⚡ Sélection', cls: 'status-selection' },
};

const MOUNTAIN_SVG = `<svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 38 L22 10 L32 22 L40 12 L62 38 Z" fill="#ffffff" fill-opacity=".12"/><path class="draw-path" pathLength="1" d="M2 38 L22 10 L32 22 L40 12 L62 38" stroke="#ff8a2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 15.5 L22 10 L26 15 L23 14 L21 16 Z" fill="#fff" fill-opacity=".8"/><circle class="sun" cx="50" cy="8" r="4" fill="#ffc23a"/></svg>`;
const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M2 20 L9 8 L13 14 L16 10 L22 20 Z" fill="#1a0d05"/><circle cx="18" cy="5" r="2.2" fill="#1a0d05"/></svg>`;

// Toast
function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.className = 'toast ' + type;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3800);
}

// Upload d'un fichier vers Supabase Storage, renvoie l'URL publique
async function uploadFile(file, bucket, folder) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
// Redimensionne (2000 px max) et compresse une photo dans le navigateur avant l'envoi.
// En cas de souci (format non lu, ex. HEIC hors Safari), on envoie l'original.
async function compressImage(file, maxSide = 2000, quality = 0.82) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 250 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const toBlob = type => new Promise(r => c.toBlob(r, type, quality));
    let blob = await toBlob('image/webp');
    if (blob?.type !== 'image/webp') blob = await toBlob('image/jpeg');   // Safari n'encode pas le WebP
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
  } catch { return file; }
}
const uploadImage = async (file, folder) => uploadFile(await compressImage(file), 'images', folder);
const uploadVideo = (file, folder) => uploadFile(file, 'videos', folder);

// ─── COUREURS ───
let runnersCache = null;
async function loadRunners(force = false) {
  if (runnersCache && !force) return runnersCache;
  const { data } = await sb.from('runners').select('*').order('sort_order').order('name');
  runnersCache = data || [];
  return runnersCache;
}
const runnerById = id => (runnersCache || []).find(r => r.id === id);
const safeColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ff6a2b';

function runnerAvatar(r, size = 28) {
  if (!r) return '';
  const st = `--rc:${safeColor(r.color)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  return r.photo_url
    ? `<img class="runner-av" src="${esc(r.photo_url)}" alt="" style="${st}" loading="lazy" />`
    : `<span class="runner-av" style="${st}">${esc(r.name.charAt(0).toUpperCase())}</span>`;
}
function runnerChip(r) {
  return r ? `<span class="runner-chip" style="--rc:${safeColor(r.color)}">${runnerAvatar(r, 18)}${esc(r.name)}</span>` : '';
}

// Coureur choisi : ?r=slug dans l'URL, sinon dernier choix mémorisé
function getSelectedRunner(runners) {
  let slug = new URLSearchParams(location.search).get('r');
  if (slug === null) { try { slug = localStorage.getItem('runner'); } catch { slug = null; } }
  return runners.find(r => r.slug === slug) || null;
}
// Sélecteur « Toute l'équipe / chaque coureur »
function mountRunnerFilter(el, runners, onChange) {
  let sel = getSelectedRunner(runners);
  const render = () => {
    el.innerHTML = `<button class="chip${sel ? '' : ' active'}" data-slug="">👥 Toute l'équipe</button>` +
      runners.map(r => `<button class="chip chip-runner${sel?.id === r.id ? ' active' : ''}" data-slug="${esc(r.slug)}" style="--rc:${safeColor(r.color)}">${runnerAvatar(r, 22)}${esc(r.name)}</button>`).join('');
  };
  render();
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-slug]');
    if (!b) return;
    sel = runners.find(r => r.slug === b.dataset.slug) || null;
    const u = new URL(location.href);
    sel ? u.searchParams.set('r', sel.slug) : u.searchParams.delete('r');
    history.replaceState(null, '', u);
    try { localStorage.setItem('runner', sel?.slug || ''); } catch {}
    render();
    onChange(sel);
  });
  return sel;
}

// ─── SESSION ───
let currentUser = null;
let currentProfile = null;
let myRunner = null;   // coureur relié au compte connecté

async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user || null;
  currentProfile = null;
  myRunner = null;
  if (currentUser) {
    const { data: mr } = await sb.from('runners').select('*').eq('user_id', currentUser.id).maybeSingle();
    myRunner = mr;
    const { data } = await sb.from('profiles').select('id, full_name, role').eq('id', currentUser.id).maybeSingle();
    currentProfile = data;
    if (!data) {
      // filet de sécurité : profil manquant (nécessaire pour commenter)
      const full_name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
      const { data: created } = await sb.from('profiles').insert({ id: currentUser.id, full_name, role: 'user' }).select('id, full_name, role').maybeSingle();
      currentProfile = created;
    }
  }
  return currentUser;
}
const isAdmin = () => currentProfile?.role === 'admin';
const canManage = () => isAdmin() || !!myRunner;
function displayName() {
  return currentProfile?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || '—';
}

// ─── LAYOUT (menu + connexion) ───
const NAV = [
  { page: 'home', href: 'index.html', icon: '🏠', label: 'Accueil' },
  { runners: true },
  { section: 'Le trail' },
  { page: 'stats', href: 'statistiques.html', icon: '📊', label: 'Statistiques' },
  { page: 'past', href: 'courses-terminees.html', icon: '🏆', label: 'Courses terminées' },
  { page: 'upcoming', href: 'prochaines-courses.html', icon: '🗓️', label: 'Prochaines courses' },
  { page: 'gear', href: 'materiel.html', icon: '🎒', label: 'Matériel' },
  { page: 'photos', href: 'photos.html', icon: '📸', label: 'Photos rando' },
  { section: 'Communauté' },
  { page: 'guestbook', href: 'livre-dor.html', icon: '💬', label: 'Livre d\'or' },
];

function renderShell() {
  const page = document.body.dataset.page;
  const links = NAV.map(n => n.runners ? '<div id="navRunners"></div>' : n.section
    ? `<div class="sidebar-section">${n.section}</div>`
    : `<a href="${n.href}" class="nav-link${n.page === page ? ' active' : ''}"><span class="ni">${n.icon}</span>${n.label}</a>`
  ).join('');
  const logo = `<a href="index.html" class="sidebar-logo"><div class="logo-mark">${LOGO_SVG}</div><div><div class="logo">TRAIL TEAM</div><div class="logo-sub">Notre univers trail</div></div></a>`;

  document.body.insertAdjacentHTML('afterbegin', `
    <header class="mobile-bar">
      ${logo}
      <button class="burger" id="burger" aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </header>
    <div class="nav-backdrop" id="navBackdrop"></div>
    <aside class="sidebar" id="sidebar">
      ${logo}
      <nav class="sidebar-nav">
        ${links}
        <div id="adminLink"></div>
      </nav>
      <div class="sidebar-bottom" id="sidebarBottom"></div>
    </aside>`);

  document.body.insertAdjacentHTML('beforeend', `
    <div class="auth-overlay" id="authOverlay">
      <div class="auth-modal" role="dialog" aria-modal="true">
        <button class="auth-close" id="authClose" aria-label="Fermer">✕</button>
        <div class="auth-logo">${LOGO_SVG}</div>
        <div class="auth-title" id="authTitle">Bienvenue !</div>
        <div class="auth-sub" id="authSub">Connecte-toi pour accéder à tout le contenu.</div>
        <div class="auth-tabs" id="authTabs">
          <button class="auth-tab active" data-tab="login">Connexion</button>
          <button class="auth-tab" data-tab="signup">Inscription</button>
        </div>
        <form class="auth-form" id="formLogin">
          <input class="form-input" type="email" id="loginEmail" placeholder="Email" autocomplete="email" required />
          <input class="form-input" type="password" id="loginPassword" placeholder="Mot de passe" autocomplete="current-password" required />
          <button class="btn btn-primary auth-submit" type="submit" id="btnLogin">Se connecter</button>
          <button class="auth-link" type="button" id="btnForgot">Mot de passe oublié ?</button>
          <div class="auth-msg" id="loginMsg"></div>
        </form>
        <form class="auth-form" id="formSignup" style="display:none">
          <input class="form-input" type="text" id="signupName" placeholder="Prénom" autocomplete="given-name" required />
          <input class="form-input" type="email" id="signupEmail" placeholder="Email" autocomplete="email" required />
          <input class="form-input" type="password" id="signupPassword" placeholder="Mot de passe (6 caractères min.)" autocomplete="new-password" minlength="6" required />
          <button class="btn btn-primary auth-submit" type="submit" id="btnSignup">Créer mon compte</button>
          <div class="auth-msg" id="signupMsg"></div>
        </form>
        <form class="auth-form" id="formReset" style="display:none">
          <input class="form-input" type="password" id="resetPassword" placeholder="Nouveau mot de passe" autocomplete="new-password" minlength="6" required />
          <button class="btn btn-primary auth-submit" type="submit" id="btnReset">Enregistrer</button>
          <div class="auth-msg" id="resetMsg"></div>
        </form>
      </div>
    </div>
    <div class="toast" id="toast"></div>`);

  // Menu mobile
  const closeNav = () => document.body.classList.remove('nav-open');
  document.getElementById('burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.getElementById('navBackdrop').addEventListener('click', closeNav);

  // Modal connexion
  document.getElementById('authClose').addEventListener('click', closeAuth);
  document.getElementById('authOverlay').addEventListener('click', e => { if (e.target.id === 'authOverlay' && !authLocked) closeAuth(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !authLocked) closeAuth(); });
  document.querySelectorAll('.auth-tab').forEach(b => b.addEventListener('click', () => showAuthTab(b.dataset.tab)));
  document.getElementById('formLogin').addEventListener('submit', onLogin);
  document.getElementById('formSignup').addEventListener('submit', onSignup);
  document.getElementById('formReset').addEventListener('submit', onResetPassword);
  document.getElementById('btnForgot').addEventListener('click', onForgot);
}

function renderUserUI() {
  const bottom = document.getElementById('sidebarBottom');
  const admin = document.getElementById('adminLink');
  if (!bottom) return;
  if (currentUser) {
    const name = displayName();
    bottom.innerHTML = `<div class="user-pill">
        <div class="user-avatar">${esc(name.charAt(0).toUpperCase())}</div>
        <div class="user-meta"><div class="user-name">${esc(name)}</div><div class="user-role">${isAdmin() ? 'Administrateur' : myRunner ? 'Coureur · ' + esc(myRunner.name) : 'Membre'}</div></div>
        <button class="btn-logout" id="btnLogout" title="Déconnexion" aria-label="Déconnexion">⎋</button>
      </div>`;
    document.getElementById('btnLogout').addEventListener('click', logout);
  } else {
    bottom.innerHTML = `<button class="btn-login-nav" id="btnAuthNav">🔑 Connexion</button>`;
    document.getElementById('btnAuthNav').addEventListener('click', () => openAuth());
  }
  admin.innerHTML = canManage()
    ? `<div class="sidebar-section">${isAdmin() ? 'Admin' : 'Mon espace'}</div><a href="dashboard.html" class="nav-link nav-admin${document.body.dataset.page === 'admin' ? ' active' : ''}"><span class="ni">⚙️</span>Tableau de bord</a>`
    : '';
}

function renderNavRunners() {
  const el = document.getElementById('navRunners');
  if (!el || !runnersCache?.length) return;
  const cur = document.body.dataset.page === 'runner' ? new URLSearchParams(location.search).get('r') : null;
  el.innerHTML = '<div class="sidebar-section">Les coureurs</div>' + runnersCache.map(r =>
    `<a href="coureur.html?r=${encodeURIComponent(r.slug)}" class="nav-link${cur === r.slug ? ' active' : ''}">${runnerAvatar(r, 24)}${esc(r.name)}</a>`).join('');
}

let authLocked = false;   // page protégée : on ne peut pas fermer le modal
let onAuthed = null;      // callback à lancer après connexion

function openAuth({ locked = false, tab = 'login' } = {}) {
  authLocked = locked;
  document.getElementById('authClose').style.display = locked ? 'none' : '';
  document.getElementById('authSub').textContent = locked
    ? 'Cette page est réservée aux membres. Connecte-toi ou crée un compte gratuitement.'
    : 'Connecte-toi pour accéder à tout le contenu.';
  showAuthTab(tab);
  document.getElementById('authOverlay').classList.add('open');
  document.body.classList.remove('nav-open');
}
function closeAuth() {
  if (authLocked) return;
  document.getElementById('authOverlay').classList.remove('open');
}
function showAuthTab(tab) {
  document.getElementById('authTabs').style.display = tab === 'reset' ? 'none' : '';
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('formLogin').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('formSignup').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('formReset').style.display = tab === 'reset' ? '' : 'none';
  document.querySelectorAll('.auth-msg').forEach(m => m.classList.remove('show'));
}
function authMsg(id, txt, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = txt; el.className = 'auth-msg show ' + type;
}
function busy(btn, on, label) {
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

function authError(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Email ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Confirme d\'abord ton email (regarde ta boîte de réception).';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet email.';
  if (m.includes('password') && m.includes('6')) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (m.includes('rate limit')) return 'Trop de tentatives, réessaie dans quelques minutes.';
  if (m.includes('fetch')) return 'Impossible de joindre le serveur. Vérifie ta connexion.';
  return error?.message || 'Une erreur est survenue.';
}

async function afterLogin() {
  await loadSession();
  authLocked = false;
  document.getElementById('authOverlay').classList.remove('open');
  renderUserUI();
  toast(`Salut ${displayName()} 👋`);
  if (onAuthed) { const cb = onAuthed; onAuthed = null; cb(currentUser); }
  document.dispatchEvent(new Event('authchange'));
}

async function onLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('btnLogin');
  busy(btn, true, 'Connexion…');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  busy(btn, false);
  if (error) return authMsg('loginMsg', authError(error));
  await afterLogin();
}

async function onSignup(e) {
  e.preventDefault();
  const full_name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const btn = document.getElementById('btnSignup');
  busy(btn, true, 'Création…');
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name }, emailRedirectTo: location.origin + location.pathname },
  });
  busy(btn, false);
  if (error) return authMsg('signupMsg', authError(error));
  if (data.session) return afterLogin();
  authMsg('signupMsg', 'Compte créé ! Clique sur le lien reçu par email pour l\'activer, puis connecte-toi.', 'success');
}

async function onForgot() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) return authMsg('loginMsg', 'Entre ton email ci-dessus, puis clique à nouveau sur « Mot de passe oublié ».');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/index.html' });
  if (error) return authMsg('loginMsg', authError(error));
  authMsg('loginMsg', 'Email envoyé ! Clique sur le lien pour choisir un nouveau mot de passe.', 'success');
}

async function onResetPassword(e) {
  e.preventDefault();
  const btn = document.getElementById('btnReset');
  busy(btn, true, 'Enregistrement…');
  const { error } = await sb.auth.updateUser({ password: document.getElementById('resetPassword').value });
  busy(btn, false);
  if (error) return authMsg('resetMsg', authError(error));
  authLocked = false; closeAuth();
  toast('Mot de passe mis à jour ✅');
}

async function logout() {
  await sb.auth.signOut();
  location.href = 'index.html';
}

// Lien « mot de passe oublié » : Supabase renvoie ici avec un événement PASSWORD_RECOVERY
sb.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') {
    setTimeout(() => {
      document.getElementById('authTitle').textContent = 'Nouveau mot de passe';
      document.getElementById('authSub').textContent = 'Choisis ton nouveau mot de passe.';
      openAuth({ locked: true, tab: 'reset' });
    }, 0);
  }
});

// Point d'entrée de chaque page.
// requireAuth: true → le contenu n'est chargé qu'après connexion.
async function initPage({ requireAuth = false, onReady } = {}) {
  renderShell();
  setupFX();
  await Promise.all([loadSession(), loadRunners()]);
  renderUserUI();
  renderNavRunners();
  if (requireAuth && !currentUser) {
    onAuthed = onReady;
    openAuth({ locked: true });
    return;
  }
  onReady?.(currentUser);
}

// ─── LIGHTBOX (photos) ───
let lbList = [], lbIndex = 0;
function openLightbox(list, index = 0) {
  let lb = document.getElementById('lightbox');
  if (!lb) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="lightbox" id="lightbox">
        <button class="lightbox-btn lightbox-close" data-lb="close" aria-label="Fermer">✕</button>
        <button class="lightbox-btn lightbox-prev" data-lb="prev" aria-label="Précédente">‹</button>
        <img id="lightboxImg" alt="" />
        <button class="lightbox-btn lightbox-next" data-lb="next" aria-label="Suivante">›</button>
        <div class="lightbox-count" id="lightboxCount"></div>
      </div>`);
    lb = document.getElementById('lightbox');
    lb.addEventListener('click', e => {
      const a = e.target.dataset.lb;
      if (a === 'prev') stepLightbox(-1);
      else if (a === 'next') stepLightbox(1);
      else if (a === 'close' || e.target === lb) lb.classList.remove('open');
    });
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); lb.classList.remove('open'); }
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    }, true);
  }
  lbList = list; lbIndex = index;
  stepLightbox(0);
  lb.classList.add('open');
}
function stepLightbox(d) {
  lbIndex = (lbIndex + d + lbList.length) % lbList.length;
  document.getElementById('lightboxImg').src = lbList[lbIndex];
  document.getElementById('lightboxCount').textContent = lbList.length > 1 ? `${lbIndex + 1} / ${lbList.length}` : '';
  document.querySelectorAll('.lightbox-prev, .lightbox-next').forEach(b => b.style.display = lbList.length > 1 ? '' : 'none');
}

// ─── DRAWER (détail d'une course) ───
function openDrawer(html) {
  let ov = document.getElementById('detailOverlay');
  if (!ov) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="detail-overlay" id="detailOverlay"></div>
      <div class="detail-drawer" id="detailDrawer" role="dialog" aria-modal="true">
        <button class="drawer-close" id="drawerClose" aria-label="Fermer">✕</button>
        <div id="drawerContent"></div>
      </div>`);
    ov = document.getElementById('detailOverlay');
    ov.addEventListener('click', closeDrawer);
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  }
  const drawer = document.getElementById('detailDrawer');
  document.getElementById('drawerContent').innerHTML = html;
  drawer.scrollTop = 0;
  ov.classList.add('open'); drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  document.getElementById('detailOverlay')?.classList.remove('open');
  document.getElementById('detailDrawer')?.classList.remove('open');
  document.body.style.overflow = '';
}

// Sections photos / vidéos communes aux deux pages de courses
function mediaSections(race) {
  const imgs = toArr(race.images);
  const vids = toArr(race.videos);
  window._drawerImgs = imgs;
  let html = '';
  if (imgs.length) html += `<div class="drawer-section"><div class="drawer-section-title">🖼️ Photos (${imgs.length})</div>
    <div class="photos-grid">${imgs.map((src, i) => `<button class="photo-item" onclick="openLightbox(window._drawerImgs, ${i})"><img src="${esc(src)}" alt="" loading="lazy" /></button>`).join('')}</div></div>`;
  if (vids.length) html += `<div class="drawer-section"><div class="drawer-section-title">🎬 Vidéos (${vids.length})</div>
    <div class="video-list">${vids.map(v => `<div class="video-item"><video src="${esc(v)}" controls preload="metadata" playsinline></video></div>`).join('')}</div></div>`;
  return html;
}

// ═══════════════════════════════════════
// LIVRE D'OR & COMMENTAIRES
// raceId null = livre d'or ; sinon commentaires d'une course
// ═══════════════════════════════════════
async function mountComments(el, { raceId = null, postId = null, placeholder = 'Écris ton message…', limit = 100, onChange = null } = {}) {
  const query = sb.from('comments')
    .select('id, message, created_at, user_id, profiles(full_name, role)')
    .order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await (raceId ? query.eq('race_id', raceId) : postId ? query.eq('post_id', postId) : query.is('race_id', null).is('post_id', null));
  const list = data || [];

  const form = currentUser
    ? `<form class="cm-form">
         <div class="user-avatar">${esc(displayName().charAt(0).toUpperCase())}</div>
         <div class="cm-field">
           <textarea class="form-textarea" maxlength="1000" rows="2" placeholder="${esc(placeholder)}" required></textarea>
           <div class="cm-actions"><span class="cm-count">0 / 1000</span><button class="btn btn-primary btn-sm" type="submit">Publier</button></div>
         </div>
       </form>`
    : `<div class="cm-login"><span>💬 Connecte-toi pour laisser un message.</span><button class="btn btn-primary btn-sm" type="button">Se connecter</button></div>`;

  el.innerHTML = `${form}
    <div class="cm-list">${error ? '<div class="cm-empty">Impossible de charger les messages.</div>'
      : list.length ? list.map(commentHTML).join('')
      : '<div class="cm-empty">Aucun message pour l\'instant. Sois le premier ! ✨</div>'}</div>`;

  el.querySelector('.cm-login button')?.addEventListener('click', () => {
    onAuthed = () => mountComments(el, { raceId, postId, placeholder, limit, onChange });
    openAuth();
  });

  const f = el.querySelector('.cm-form');
  if (f) {
    const ta = f.querySelector('textarea'), count = f.querySelector('.cm-count');
    ta.addEventListener('input', () => count.textContent = `${ta.value.length} / 1000`);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) f.requestSubmit(); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const message = ta.value.trim();
      if (!message) return;
      const btn = f.querySelector('button');
      busy(btn, true, 'Envoi…');
      const { error } = await sb.from('comments').insert({ message, race_id: raceId, post_id: postId });
      busy(btn, false);
      if (error) return toast(error.message.includes('Trop de messages') ? 'Doucement ! Attends une minute avant de reposter.' : 'Erreur : ' + error.message, 'error');
      toast('Message publié ✅');
      onChange?.();
      mountComments(el, { raceId, postId, placeholder, limit, onChange });
    });
  }

  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce message ?')) return;
    const { error } = await sb.from('comments').delete().eq('id', b.dataset.del);
    if (error) return toast('Erreur : ' + error.message, 'error');
    b.closest('.cm-item').remove();
    onChange?.();
    toast('Message supprimé');
  }));
}

function commentHTML(c) {
  const name = c.profiles?.full_name || 'Membre';
  const canDelete = currentUser && (c.user_id === currentUser.id || isAdmin());
  return `<div class="cm-item">
    <div class="user-avatar">${esc(name.charAt(0).toUpperCase())}</div>
    <div class="cm-body">
      <div class="cm-head">
        <strong>${esc(name)}</strong>
        ${(() => { const r = (runnersCache || []).find(x => x.user_id && x.user_id === c.user_id); return r ? runnerChip(r) : c.profiles?.role === 'admin' ? '<span class="badge badge-orange">Admin</span>' : ''; })()}
        <span class="cm-date" title="${esc(new Date(c.created_at).toLocaleString('fr-FR'))}">${fmtRelative(c.created_at)}</span>
        ${canDelete ? `<button class="cm-del" data-del="${c.id}" title="Supprimer" aria-label="Supprimer">🗑️</button>` : ''}
      </div>
      <div class="cm-text">${esc(c.message)}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
// EFFETS INTERACTIFS
// ═══════════════════════════════════════
const FX = {
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
};

// Chiffre qui défile de 0 à sa valeur quand il devient visible
function countUp(el, value, suffix = '') {
  const n = Math.round(+value || 0);
  const token = el._countUp = {};   // un nouvel appel annule l'animation précédente
  el._io?.disconnect();
  if (FX.reduced || !n || !('IntersectionObserver' in window)) { el.innerHTML = fmtNum(n) + suffix; return; }
  el.innerHTML = '0' + suffix;
  const io = el._io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const t0 = performance.now(), dur = 1500;
    const step = t => {
      if (el._countUp !== token) return;
      const p = Math.min(Math.max((t - t0) / dur, 0), 1);
      el.innerHTML = fmtNum(Math.round(n * (1 - Math.pow(1 - p, 4)))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  io.observe(el);
}

// Apparition des blocs au défilement (s'applique aussi au contenu chargé plus tard)
const REVEAL_SEL = '.race-card, .mat-card, .stat, .strip-item, .card, .record, .next-race, .quote-block, .group-title, .section-head, .filters';
function setupReveal() {
  if (FX.reduced || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    el.classList.add('in');
    io.unobserve(el);
    // une fois apparu, on retire le délai pour que le survol reste instantané
    setTimeout(() => el.style.transitionDelay = '', 1000);
  }), { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  const scan = root => root.querySelectorAll(REVEAL_SEL).forEach(el => {
    if (el.dataset.rv || el.closest('.modal-overlay, .auth-overlay, .detail-drawer, .sidebar, .mobile-bar')) return;
    el.dataset.rv = '1';
    const sibs = [...el.parentElement.children].filter(c => c.matches(REVEAL_SEL));
    el.style.transitionDelay = Math.min(sibs.indexOf(el), 8) * 70 + 'ms';
    el.classList.add('reveal');
    io.observe(el);
  });
  const root = document.querySelector('.main') || document.body;
  scan(root);
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType === 1) scan(n.parentElement || root);
  }))).observe(root, { childList: true, subtree: true });
}

// Projecteur + inclinaison 3D qui suivent la souris, halo « lampe frontale »
const SPOT_SEL = '.race-card, .mat-card, .stat, .next-race, .kpi, .record, .strip-item';
const TILT_SEL = '.race-card, .mat-card';
function setupPointer() {
  if (!FX.fine || FX.reduced) return;
  const lamp = document.createElement('div');
  lamp.className = 'headlamp';
  document.body.appendChild(lamp);

  let last = null, raf = 0, ev = null;
  const reset = el => { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); };
  document.addEventListener('pointermove', e => {
    ev = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      lamp.style.setProperty('--hx', ev.clientX + 'px');
      lamp.style.setProperty('--hy', ev.clientY + 'px');
      const el = ev.target.closest?.(SPOT_SEL);
      if (last && last !== el) reset(last);
      last = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      el.style.setProperty('--mx', x + 'px');
      el.style.setProperty('--my', y + 'px');
      if (el.matches(TILT_SEL)) {
        el.style.setProperty('--rx', ((0.5 - y / r.height) * 7).toFixed(2) + 'deg');
        el.style.setProperty('--ry', ((x / r.width - 0.5) * 9).toFixed(2) + 'deg');
      }
    });
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { if (last) reset(last); last = null; });
}

// Onde au clic sur les boutons
function setupRipple() {
  if (FX.reduced) return;
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn, .chip, .btn-login-nav, .auth-tab');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });
}

// Boutons qui « attirent » le curseur
function magnetize(selector, strength = 0.3) {
  if (!FX.fine || FX.reduced) return;
  document.querySelectorAll(selector).forEach(b => {
    b.classList.add('magnetic');
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.translate = `${(e.clientX - r.left - r.width / 2) * strength}px ${(e.clientY - r.top - r.height / 2) * strength}px`;
    });
    b.addEventListener('pointerleave', () => b.style.translate = '');
  });
}

// Barre de progression de lecture
function setupProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.appendChild(bar);
  const update = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', h > 0 ? (scrollY / h).toFixed(4) : 0);
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

// Fondu en sortie quand on change de page
function setupPageTransitions() {
  if (FX.reduced) return;
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || a.target || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname) return;
    e.preventDefault();
    document.body.classList.add('leaving');
    setTimeout(() => location.href = url.href, 200);
  });
  addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('leaving'); });
}

function setupFX() {
  setupReveal();
  setupPointer();
  setupRipple();
  setupProgress();
  setupPageTransitions();
}
