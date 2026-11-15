// Synchro des courses terminées depuis UTMB World (utmb.world).
//
// Deux façons de l'appeler :
//  • le cron Vercel (voir vercel.json), chaque nuit, pour tous les coureurs qui ont un profil UTMB.
//    Vercel envoie « Authorization: Bearer <CRON_SECRET> » ; l'écriture se fait avec la clé
//    SUPABASE_SERVICE_ROLE_KEY. Ces deux variables se règlent dans Vercel > Settings > Environment Variables.
//  • le bouton « Synchroniser » du tableau de bord : POST { runner_id } avec le jeton de session
//    du membre connecté. Les règles Supabase (can_edit_runner) décident s'il a le droit d'écrire.
//
// UTMB n'a pas d'API publique : on lit les données JSON incluses dans les pages du site
// (balise __NEXT_DATA__). Si UTMB change son site, la synchro échoue sans rien abîmer.
//
// Règles : on n'écrase jamais ce qui a été saisi à la main. Une course déjà présente à la même
// date (terminée ou « prochaine course ») est reliée et seulement complétée là où c'est vide.

const SUPABASE_URL = 'https://yhkbpshmhtqznduwhcrj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inloa2Jwc2htaHRxem5kdXdoY3JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTk5MjUsImV4cCI6MjA5ODEzNTkyNX0.lY_h5h1RZZsCbgYHA-Ju3K2YTpwXvtwBo-LgZpQhynU';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const UTMB = 'https://utmb.world/fr';
const UA = 'Mozilla/5.0 (compatible; TrailTeamSync/1.0)';
const MAX_NEW_PER_RUN = 40;        // les suivantes arrivent à la synchro d'après (limite de durée Vercel)
const MAX_BACKFILL_PER_RUN = 25;   // courses existantes dont on va rechercher le logo / lieu
const toArr = v => (Array.isArray(v) ? v.filter(Boolean) : []);
const RUNNER_FIELDS = 'id,name,utmb_uri,utmb_since';

// ─── SUPABASE (REST) ───
async function db(ctx, path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ctx.key, 'Content-Type': 'application/json',
      ...(ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(data?.message || `Supabase ${r.status}`);
  return data;
}

// ─── UTMB ───
async function utmbPage(path) {
  const r = await fetch(`${UTMB}/${path}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`UTMB a répondu ${r.status}`);
  const m = (await r.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Format de page UTMB inattendu');
  return JSON.parse(m[1])?.props?.pageProps || null;
}

const clean = s => String(s || '').replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
function raceTitle(r) {
  const ev = clean(r.eventName), rn = clean(r.raceName);
  if (!rn || ev.toLowerCase().includes(rn.toLowerCase())) return ev || rn;
  if (!ev || rn.toLowerCase().includes(ev.toLowerCase())) return rn;
  return `${ev} – ${rn}`;
}
// "04:19:23" → "4h19'23" (format utilisé sur le site)
function fmtTime(t) {
  const m = String(t || '').match(/^(\d+):(\d{2}):(\d{2})$/);
  return m ? `${+m[1]}h${m[2]}'${m[3]}` : (t || null);
}
// "75 / 337" : même format que les courses saisies à la main
const fmtRank = r => r.rank ? `${r.rank} / ${r.totalRanked}` : null;
const result = r => ({ finish_time: r.isDnf ? null : fmtTime(r.time), rank: r.isDnf ? null : fmtRank(r), dnf: !!r.isDnf });
const num = v => (Number.isFinite(+v) && +v > 0 ? +v : null);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dayDiff = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

// Infos de la course (logo, lieu de départ). UTMB refuse parfois les requêtes trop
// rapprochées : on réessaie 3 fois en espaçant. Échec = { ok: false }, on retentera
// à la synchro suivante (voir « Rattrapage » plus bas).
async function raceInfo(uri) {
  for (let attempt = 1; ; attempt++) {
    try {
      const p = await utmbPage(`utmb-index/races/${encodeURIComponent(uri)}`);
      return { ok: true, image_url: p?.logo || null, location: clean(p?.startPlace) || null };
    } catch (e) {
      if (attempt >= 3) { console.warn(`UTMB course ${uri} : ${e.message}`); return { ok: false }; }
      await sleep(1000 * attempt);
    }
  }
}
async function mapLimit(items, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function syncRunner(ctx, runner) {
  const page = await utmbPage(`runner/${encodeURIComponent(runner.utmb_uri)}`);
  const all = page?.results?.results;
  if (!Array.isArray(all)) throw new Error(`Profil UTMB « ${runner.utmb_uri} » introuvable`);

  const today = new Date().toISOString().slice(0, 10);
  const results = all.filter(r => r.uri && /^\d{4}-\d{2}-\d{2}$/.test(r.dateIso || '') && r.dateIso <= today
    && (!runner.utmb_since || r.dateIso >= runner.utmb_since) && (r.time || r.isDnf));

  const started = Date.now();
  const existing = await db(ctx, `races?runner_id=eq.${runner.id}&select=id,type,date,utmb_race_uri,finish_time,rank,dnf,distance,dplus,country,location,image_url,images`);
  const byUri = new Map(existing.filter(e => e.utmb_race_uri).map(e => [e.utmb_race_uri, e]));
  const free = existing.filter(e => !e.utmb_race_uri);
  const stats = { added: 0, linked: 0, updated: 0, pending: 0 };
  const toInsert = [];

  for (const r of results) {
    const known = byUri.get(r.uri);
    if (known) {
      // Résultat publié après coup (ex : classement pas encore dispo à la 1re synchro)
      if (!known.finish_time && !known.rank && !known.dnf && (r.time || r.isDnf)) {
        await db(ctx, `races?id=eq.${known.id}`, { method: 'PATCH', body: result(r), prefer: 'return=minimal' });
        stats.updated++;
      }
      continue;
    }
    // Course déjà saisie à la main à la même date (à un jour près : les dates UTMB et la saisie
    // manuelle diffèrent parfois d'un jour) : on la relie et on complète les vides
    let j = -1, best = 99;
    free.forEach((e, k) => {
      const d = dayDiff(e.date, r.dateIso) + (e.type === 'past' ? 0 : 0.5);   // priorité : même date, course terminée
      if (d <= 1.5 && d < best) { best = d; j = k; }
    });
    if (j >= 0) {
      const e = free.splice(j, 1)[0];
      e.utmb_race_uri = r.uri;   // pour le rattrapage du logo / lieu plus bas
      const patch = { utmb_race_uri: r.uri, type: 'past', updated_at: new Date().toISOString() };
      if (e.type !== 'past' || (!e.finish_time && !e.rank && !e.dnf)) Object.assign(patch, result(r));
      if (e.distance == null) patch.distance = num(r.distance);
      if (e.dplus == null) patch.dplus = num(r.elevationGain);
      if (!e.country && /^[A-Z]{2}$/.test(r.countryCode || '')) patch.country = r.countryCode;
      await db(ctx, `races?id=eq.${e.id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
      stats.linked++;
      continue;
    }
    toInsert.push(r);
  }

  const batch = toInsert.slice(0, MAX_NEW_PER_RUN);
  stats.pending = toInsert.length - batch.length;
  if (batch.length) {
    const infos = await mapLimit(batch, 2, r => raceInfo(r.uri));
    const rows = batch.map((r, k) => {
      const distance = num(r.distance);
      return {
        runner_id: runner.id, type: 'past', utmb_race_uri: r.uri,
        name: raceTitle(r), date: r.dateIso,
        location: infos[k].location || null,
        country: /^[A-Z]{2}$/.test(r.countryCode || '') ? r.countryCode : null,
        distance, dplus: num(r.elevationGain),
        race_type: distance >= 80 ? 'ultra' : 'trail',
        image_url: infos[k].image_url || null,
        ...result(r),
      };
    });
    await db(ctx, 'races', { method: 'POST', body: rows, prefer: 'return=minimal' });
    stats.added = rows.length;
  }

  // Rattrapage : courses UTMB sans image ni lieu (logo pas récupéré à l'import, ou course
  // saisie à la main puis reliée). On complète seulement ce qui est vide, quelques-unes par
  // synchro pour rester dans la limite de durée Vercel.
  const missing = existing.filter(e => e.utmb_race_uri && ((!e.image_url && !toArr(e.images).length) || !e.location));
  for (const e of missing.slice(0, MAX_BACKFILL_PER_RUN)) {
    if (Date.now() - started > 40000) break;
    const info = await raceInfo(e.utmb_race_uri);
    if (!info.ok) continue;
    const patch = {};
    if (!e.image_url && !toArr(e.images).length && info.image_url) patch.image_url = info.image_url;
    if (!e.location && info.location) patch.location = info.location;
    if (Object.keys(patch).length) {
      await db(ctx, `races?id=eq.${e.id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
      stats.completed = (stats.completed || 0) + 1;
    }
  }

  await db(ctx, `runners?id=eq.${runner.id}`, { method: 'PATCH', body: { utmb_synced_at: new Date().toISOString() }, prefer: 'return=minimal' });
  return stats;
}

module.exports = async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let ctx, runners;

    if (CRON_SECRET && token === CRON_SECRET) {
      if (!SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Variable SUPABASE_SERVICE_ROLE_KEY absente sur Vercel' });
      // Nouvelle clé « sb_secret_… » : uniquement dans l'en-tête apikey (ce n'est pas un JWT).
      // Ancienne clé service_role (JWT) : aussi en Bearer.
      ctx = { key: SERVICE_KEY, token: SERVICE_KEY.startsWith('sb_') ? null : SERVICE_KEY };
      runners = await db(ctx, `runners?utmb_uri=not.is.null&select=${RUNNER_FIELDS}`);
    } else {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const rid = String(body.runner_id || '');
      if (!token || !/^[0-9a-f-]{36}$/i.test(rid)) return res.status(400).json({ ok: false, error: 'Requête invalide' });
      ctx = { key: SUPABASE_ANON_KEY, token };
      if (await db(ctx, 'rpc/can_edit_runner', { method: 'POST', body: { rid } }) !== true)
        return res.status(403).json({ ok: false, error: 'Tu ne peux pas modifier ce coureur' });
      runners = await db(ctx, `runners?id=eq.${rid}&select=${RUNNER_FIELDS}`);
      if (!runners[0]?.utmb_uri) return res.status(400).json({ ok: false, error: 'Aucun profil UTMB renseigné pour ce coureur' });
    }

    const report = [];
    for (const r of runners) {
      try { report.push({ runner: r.name, ...(await syncRunner(ctx, r)) }); }
      catch (e) { report.push({ runner: r.name, error: e.message }); }
    }
    const failed = report.length > 0 && report.every(r => r.error);
    res.status(failed ? 502 : 200).json({ ok: !failed, report, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
