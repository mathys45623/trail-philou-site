// ═══════════════════════════════════════
// TRAIL PHILOU — JS PARTAGÉ
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

const RACE_TYPES = { trail: 'Trail', ultra: 'Ultra', sky: 'Skyrace', route: 'Route' };
const STATUS = {
  objectif:  { label: '🎯 Objectif',  cls: 'status-objectif' },
  inscrit:   { label: '✅ Inscrit',   cls: 'status-inscrit' },
  selection: { label: '⚡ Sélection', cls: 'status-selection' },
};

const MOUNTAIN_SVG = `<svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 38 L22 10 L32 22 L40 12 L62 38 Z" fill="#ffffff" fill-opacity=".12"/><path d="M2 38 L22 10 L32 22 L40 12 L62 38" stroke="#ff8a2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 15.5 L22 10 L26 15 L23 14 L21 16 Z" fill="#fff" fill-opacity=".8"/><circle cx="50" cy="8" r="4" fill="#ffc23a"/></svg>`;
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
const uploadImage = (file, folder) => uploadFile(file, 'images', folder);
const uploadVideo = (file, folder) => uploadFile(file, 'videos', folder);

// ─── SESSION ───
let currentUser = null;
let currentProfile = null;

async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user || null;
  currentProfile = null;
  if (currentUser) {
    const { data } = await sb.from('profiles').select('id, full_name, role').eq('id', currentUser.id).maybeSingle();
    currentProfile = data;
  }
  return currentUser;
}
const isAdmin = () => currentProfile?.role === 'admin';
function displayName() {
  return currentProfile?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || '—';
}

// ─── LAYOUT (menu + connexion) ───
const NAV = [
  { page: 'home', href: 'index.html', icon: '🏠', label: 'Accueil' },
  { section: 'Mon trail' },
  { page: 'stats', href: 'statistiques.html', icon: '📊', label: 'Statistiques' },
  { page: 'past', href: 'courses-terminees.html', icon: '🏆', label: 'Courses terminées' },
  { page: 'upcoming', href: 'prochaines-courses.html', icon: '🗓️', label: 'Prochaines courses' },
  { page: 'gear', href: 'materiel.html', icon: '🎒', label: 'Mon matériel' },
];

function renderShell() {
  const page = document.body.dataset.page;
  const links = NAV.map(n => n.section
    ? `<div class="sidebar-section">${n.section}</div>`
    : `<a href="${n.href}" class="nav-link${n.page === page ? ' active' : ''}"><span class="ni">${n.icon}</span>${n.label}</a>`
  ).join('');
  const logo = `<a href="index.html" class="sidebar-logo"><div class="logo-mark">${LOGO_SVG}</div><div><div class="logo">TRAIL PHILOU</div><div class="logo-sub">Mon univers trail</div></div></a>`;

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
        <div class="user-meta"><div class="user-name">${esc(name)}</div><div class="user-role">${isAdmin() ? 'Administrateur' : 'Membre'}</div></div>
        <button class="btn-logout" id="btnLogout" title="Déconnexion" aria-label="Déconnexion">⎋</button>
      </div>`;
    document.getElementById('btnLogout').addEventListener('click', logout);
  } else {
    bottom.innerHTML = `<button class="btn-login-nav" id="btnAuthNav">🔑 Connexion</button>`;
    document.getElementById('btnAuthNav').addEventListener('click', () => openAuth());
  }
  admin.innerHTML = isAdmin()
    ? `<div class="sidebar-section">Admin</div><a href="dashboard.html" class="nav-link nav-admin${document.body.dataset.page === 'admin' ? ' active' : ''}"><span class="ni">⚙️</span>Tableau de bord</a>`
    : '';
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
  await loadSession();
  renderUserUI();
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
