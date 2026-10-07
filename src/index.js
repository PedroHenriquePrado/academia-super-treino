import {exerciseLibrary,exerciseGuide,exercisePresentation} from './exercises.js';
const TZ = 'America/Sao_Paulo';
const SESSION_HOURS = 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const PBKDF2_ITERATIONS = 100000;

const encoder = new TextEncoder();

async function dbGet(db, sql, ...args) {
  return await db.prepare(sql).bind(...args).first();
}
async function dbAll(db, sql, ...args) {
  const result = await db.prepare(sql).bind(...args).all();
  return result.results || [];
}
async function dbRun(db, sql, ...args) {
  return await db.prepare(sql).bind(...args).run();
}
async function dbInsertId(db, sql, ...args) {
  const row = await db.prepare(`${sql} RETURNING id`).bind(...args).first();
  return Number(row?.id);
}

function htmlEscape(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function attr(v = '') { return htmlEscape(v); }
function money(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0)); }
function initials(name = 'ST') { return String(name).trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || 'ST'; }

function localParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}
function today() {
  const p = localParts();
  return `${p.year}-${p.month}-${p.day}`;
}
function nowLocal() {
  const p = localParts();
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
function currentReference() { return today().slice(0, 7); }
function brDate(v) {
  if (!v) return '—';
  const s = String(v);
  if (/Z$|[+-]\d\d:\d\d$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ }).format(d);
  }
  const [y, m, d] = s.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}
function brTimestamp(v) {
  if (!v) return '—';
  const iso = String(v).includes('T') ? String(v) : String(v).replace(' ', 'T') + 'Z';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? htmlEscape(v) : new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(date);
}
function referenceLabel(ref) {
  const [y, m] = String(ref).split('-');
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(Date.UTC(Number(y), Number(m) - 1, 2, 12)));
}
function lastDayOfRef(ref) {
  const [y, m] = ref.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function dueDateFor(day, ref = currentReference()) {
  return `${ref}-${String(Math.min(Number(day) || 10, lastDayOfRef(ref))).padStart(2, '0')}`;
}
function invoiceStatus(inv) {
  if (inv.status === 'paid') return 'Pago';
  if (inv.status === 'cancelled') return 'Cancelada';
  const t = today();
  if (inv.due_date < t) return 'Vencido';
  if (inv.due_date === t) return 'Vence hoje';
  const [y1, m1, d1] = inv.due_date.split('-').map(Number);
  const [y2, m2, d2] = t.split('-').map(Number);
  const diff = Math.ceil((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
  if (diff > 0 && diff <= 3) return `Vence em ${diff} dia${diff > 1 ? 's' : ''}`;
  return 'Em aberto';
}
function badge(status) {
  const cls = status === 'Pago' || status === 'Ativo' || status === 'Em dia' || status === 'Matriculou' ? 'success' :
    status === 'Vencido' || status === 'Inativo' || status === 'Não interessado' ? 'danger' :
      String(status).startsWith('Vence') || status === 'Visita marcada' ? 'warning' : 'neutral';
  return `<span class="badge ${cls}">${htmlEscape(status)}</span>`;
}
function birthdayToday(birthDate) { return Boolean(birthDate) && String(birthDate).slice(5, 10) === today().slice(5, 10); }
function birthdayThisMonth(birthDate) { return Boolean(birthDate) && String(birthDate).slice(5, 7) === today().slice(5, 7); }
function studentAddress(s) {
  const built = [s.street, s.number, s.complement, s.neighborhood, s.city, s.state].filter(Boolean).join(', ');
  return built || s.address || '';
}
function gymAddress(g) { return [g.street, g.number, g.complement, g.neighborhood, g.city, g.state].filter(Boolean).join(', '); }
function whatsappLink(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '#';
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
function templateMessage(template, items, gymName = 'Academia Super Treino') {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.workout_label)) groups.set(item.workout_label, []);
    groups.get(item.workout_label).push(item);
  }
  let msg = `🏋️ *${gymName}*\n\n*${template.name}*\n`;
  if (template.notes) msg += `${template.notes}\n`;
  for (const [label, rows] of groups) {
    msg += `\n*${label}*\n`;
    for (const r of rows) {
      msg += `• ${r.exercise} — ${r.sets}×${r.reps}${r.rest ? ` · descanso ${r.rest}` : ''}\n`;
      if (r.exercise_notes) msg += `  ↳ ${r.exercise_notes}\n`;
    }
  }
  msg += `\nQualquer dúvida sobre execução, carga ou adaptação, fale com a equipe. 💪`;
  return msg;
}
function receiptMessage(inv, student, g) {
  return `🧾 *Comprovante de pagamento — ${g.gym_name}*\n\nAluno: ${student.name}\nReferência: ${inv.reference_month}\nValor: ${money(inv.amount)}\nPagamento: ${brDate(inv.paid_at)}\nForma: ${inv.payment_method || '—'}\nRecibo: ${inv.receipt_number || '—'}\n\n${g.receipt_footer || 'Obrigado pela confiança!'}`;
}
function csvEscape(v) { const s = String(v ?? ''); return `"${s.replaceAll('"', '""')}"`; }

function securityHeaders(type = 'text/html; charset=utf-8') {
  return {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://viacep.com.br; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'Cache-Control': 'no-store'
  };
}
function htmlResponse(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...securityHeaders(), ...extra } });
}
function dataResponse(body, type, filename) {
  const headers = { ...securityHeaders(type) };
  if (filename) headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  return new Response(body, { status: 200, headers });
}
function redirect(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...extraHeaders } });
}
async function bodyParams(request) {
  const raw = await request.text();
  if (raw.length > 7_000_000) throw new Error('Formulário muito grande. Reduza o tamanho da imagem.');
  return new URLSearchParams(raw);
}
function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function randomToken(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function bytesToBase64(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
}
function base64ToBytes(s) {
  const raw = atob(s); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}
async function verifyPassword(password, stored) {
  try {
    const [kind, it, salt64, hash64] = String(stored).split('$');
    if (kind !== 'pbkdf2') return false;
    const iterations = Number(it);
    if (!Number.isInteger(iterations) || iterations < 50000 || iterations > 100000) return false;
    const salt = base64ToBytes(salt64);
    const expected = base64ToBytes(hash64);
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, expected.length * 8);
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}
function safeEqualString(a, b) {
  const aa = encoder.encode(String(a || '')), bb = encoder.encode(String(b || ''));
  if (aa.length !== bb.length) return false;
  let diff = 0; for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
async function gym(env) {
  return await dbGet(env.DB, 'SELECT * FROM gym_settings WHERE id=1') || {
    id: 1, gym_name: 'Academia Super Treino', slogan: 'Sua evolução começa aqui', receipt_footer: 'Obrigado pela confiança. Bons treinos!'
  };
}
async function currentUser(request, env) {
  const token = parseCookies(request).session;
  if (!token) return null;
  const hash = await sha256Hex(token);
  const u = await dbGet(env.DB, `SELECT u.id,u.name,u.email,u.is_active,u.must_change_password,s.csrf_token,s.created_at,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.is_active=1`, hash, new Date().toISOString());
  if (!u) return null;
  // Mesmo sessões criadas antes da atualização expiram após 12 horas.
  const created = Date.parse(String(u.created_at).replace(' ', 'T') + (String(u.created_at).includes('Z') ? '' : 'Z'));
  if (!Number.isFinite(created) || Date.now() - created > SESSION_HOURS * 3600000) return null;
  if (!u.csrf_token) {
    u.csrf_token = randomToken(24);
    await dbRun(env.DB, 'UPDATE sessions SET csrf_token=? WHERE token_hash=? AND csrf_token IS NULL', u.csrf_token, hash);
    const existing = await dbGet(env.DB, 'SELECT csrf_token FROM sessions WHERE token_hash=?', hash);
    u.csrf_token = existing?.csrf_token || u.csrf_token;
  }
  return u;
}
function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}
function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
// Token exclusivo do formulário de login: não usa nem altera o banco D1.
// Em HTTPS, o prefixo __Host- impede cookies de subdomínios e exige Secure/Path=/.
function loginCsrfCookieName(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-st_login_csrf' : 'st_login_csrf';
}
function loginCsrfCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${loginCsrfCookieName(request)}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${secure}`;
}
async function loginCsrfAllowed(request) {
  const cookie = parseCookies(request)[loginCsrfCookieName(request)];
  if (!/^[0-9a-f]{64}$/.test(cookie || '')) return false;
  const raw = await request.clone().text();
  if (raw.length > 10000) return false;
  const posted = new URLSearchParams(raw).get('login_csrf_token');
  return Boolean(posted && safeEqualString(cookie, posted));
}
async function createSession(userId, env) {
  const token = randomToken();
  const hash = await sha256Hex(token);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
  await dbRun(env.DB, 'INSERT INTO sessions (token_hash,user_id,expires_at,csrf_token) VALUES (?,?,?,?)', hash, userId, expires, csrf);
  return token;
}
function auditStatement(env, user, action, entityType, entityId, description = '', oldData = null, newData = null) {
  return env.DB.prepare('INSERT INTO audit_log (user_id,actor_name,action,entity_type,entity_id,description,old_data,new_data) VALUES (?,?,?,?,?,?,?,?)')
    .bind(user.id, user.name, action, entityType, entityId, description, oldData && JSON.stringify(oldData), newData && JSON.stringify(newData));
}
function financeSnapshot(item) {
  if (!item) return null;
  return { status: item.status, amount: item.amount, due_date: item.due_date, paid_at: item.paid_at, payment_method: item.payment_method, receipt_number: item.receipt_number };
}
async function deleteCurrentSession(request, env) {
  const token = parseCookies(request).session;
  if (token) await dbRun(env.DB, 'DELETE FROM sessions WHERE token_hash=?', await sha256Hex(token));
}
async function loginBlocked(env, ip) {
  const row = await dbGet(env.DB, 'SELECT * FROM login_attempts WHERE ip=?', ip);
  if (!row) return false;
  const age = Date.now() - new Date(row.window_start).getTime();
  return age < LOGIN_WINDOW_MS && Number(row.failures) >= LOGIN_MAX_FAILURES;
}
async function recordLoginFailure(env, ip) {
  const row = await dbGet(env.DB, 'SELECT * FROM login_attempts WHERE ip=?', ip);
  const now = new Date().toISOString();
  if (!row || Date.now() - new Date(row.window_start).getTime() >= LOGIN_WINDOW_MS) {
    await dbRun(env.DB, 'INSERT INTO login_attempts (ip,window_start,failures) VALUES (?,?,1) ON CONFLICT(ip) DO UPDATE SET window_start=excluded.window_start, failures=1', ip, now);
  } else {
    await dbRun(env.DB, 'UPDATE login_attempts SET failures=failures+1 WHERE ip=?', ip);
  }
}
async function clearLoginFailures(env, ip) { await dbRun(env.DB, 'DELETE FROM login_attempts WHERE ip=?', ip); }

async function ensureCurrentInvoices(env) {
  const ref = currentReference();
  const [cy, cm] = ref.split('-').map(Number);
  const last = lastDayOfRef(ref);
  await dbRun(env.DB, `
    INSERT OR IGNORE INTO invoices (student_id,reference_month,due_date,amount,status)
    SELECT s.id, ?, ? || '-' || printf('%02d', CASE WHEN s.due_day>? THEN ? ELSE s.due_day END), s.monthly_value, 'open'
    FROM students s LEFT JOIN plans p ON p.id=s.plan_id
    WHERE s.status='active'
      AND substr(s.start_date,1,7)<=?
      AND (((? - CAST(substr(s.start_date,1,4) AS INTEGER))*12 + (? - CAST(substr(s.start_date,6,2) AS INTEGER))) % COALESCE(NULLIF(p.months,0),1))=0
  `, ref, ref, last, last, ref, cy, cm);
}

function flashFrom(url) {
  const msg = url.searchParams.get('ok');
  if (!msg) return '';
  return `<div class="toast success-toast">✓ ${htmlEscape(msg)}</div>`;
}
function nav(active = '', g, csrfToken = '') {
  const items = [
    ['dashboard', '/', 'Dashboard', '⌂'], ['students', '/alunos', 'Alunos', '👥'], ['invoices', '/mensalidades', 'Mensalidades', '💳'],
    ['workouts', '/treinos', 'Treinos', '🏋️'], ['leads', '/leads', 'Futuros clientes', '🎯'], ['whatsapp', '/whatsapp', 'WhatsApp', '◉'],
    ['reports', '/relatorios', 'Relatórios', '▥'], ['backup', '/backup', 'Backup', '↧'], ['settings', '/configuracoes', 'Configurações', '⚙'], ['security', '/seguranca', 'Usuários e segurança', '🔐']
  ];
  const logo = g.logo_data ? `<img class="brand-logo" src="${attr(g.logo_data)}" alt="">` : `<div class="brand-mark">${htmlEscape(initials(g.gym_name))}</div>`;
  return `<aside class="sidebar"><div class="brand">${logo}<div><strong>${htmlEscape(g.gym_name)}</strong><small>Gestão online · Cloudflare</small></div></div><nav>${items.map(([k, u, l, i]) => `<a class="${active === k ? 'active' : ''}" href="${u}"><span>${i}</span>${l}</a>`).join('')}</nav><div class="sidebar-foot"><small>☁ Dados na nuvem · acesso seguro</small><form class="logout-form" method="post" action="/logout"><input type="hidden" name="csrf_token" value="${attr(csrfToken)}"><button class="logout" type="submit">Sair</button></form></div></aside>`;
}
function layout(title, content, active = '', user = null, actions = '', g = { gym_name: 'Academia Super Treino' }) {
  const dateText = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: TZ }).format(new Date());
  // Preferência visual local; não acessa nem altera o banco D1.
  const themeToggle = `<button type="button" class="theme-toggle${user ? '' : ' guest-theme-toggle'}" data-theme-toggle aria-label="Ativar modo escuro" aria-pressed="false" title="Ativar modo escuro"><span class="theme-icon" aria-hidden="true">🌙</span><span class="theme-label">Modo escuro</span></button>`;
  const themeBeforePaint = `<script>(function(){try{var choice=localStorage.getItem('super-treino-theme');var dark=choice==='dark'||(choice!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme',window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}})();</script>`;
  const csrfInput = user?.csrf_token ? `<input type="hidden" name="csrf_token" value="${attr(user.csrf_token)}">` : '';
  const protectedContent = csrfInput ? content.replace(/<form\b[^>]*>/gi, form => /\bmethod\s*=\s*[\"']?post\b/i.test(form) ? `${form}${csrfInput}` : form) : content;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111827"><title>${htmlEscape(title)} · ${htmlEscape(g.gym_name)}</title>${themeBeforePaint}<link rel="stylesheet" href="/style.css?v=190"></head><body>${user ? nav(active, g, user.csrf_token) : themeToggle}<main class="${user ? 'app' : ''}">${user ? `<header class="topbar"><div class="topbar-left"><button class="menu-btn" type="button" aria-label="Menu" onclick="document.body.classList.toggle('menu-open')">☰</button><div><h1>${htmlEscape(title)}</h1><p>${htmlEscape(dateText)}</p></div></div><div class="top-actions">${actions}${themeToggle}<div class="user-pill"><span class="avatar">${htmlEscape(initials(user.name).slice(0, 1))}</span><div><strong>${htmlEscape(user.name)}</strong><small>${user.must_change_password ? 'Trocar senha' : 'Administrador'}</small></div></div></div></header>` : ''}<section class="content">${protectedContent}</section></main><script src="/app.js?v=190"></script></body></html>`;
}

function studentForm(s = {}, plans = [], action = '/alunos', title = 'Novo aluno') {
  const isEdit = Boolean(s.id);
  const cancelHref = String(action).startsWith('/leads/') ? '/leads' : (isEdit ? `/alunos/${s.id}` : '/alunos');
  const photo = s.photo_data || '';
  const addressPreview = studentAddress(s);
  return `<form class="form-shell student-registration" method="post" action="${action}" data-student-id="${s.id || ''}" data-today="${today()}">
    <div class="form-hero"><div><span class="eyebrow">${isEdit ? 'CADASTRO DO ALUNO' : 'NOVO CADASTRO'}</span><h2>${htmlEscape(title)}</h2><p>Dados pessoais, endereço, plano e cobrança em uma única ficha.</p></div><div class="photo-editor"><div class="photo-preview" id="photoPreview">${photo ? `<img src="${attr(photo)}" alt="">` : `<span>${htmlEscape(initials(s.name || 'Aluno'))}</span>`}</div><label class="btn secondary small file-btn">Foto<input id="photoFile" type="file" accept="image/*" hidden></label><input type="hidden" name="photo_data" id="photoData" value="${attr(photo)}"></div></div>
    <div class="form-section"><div class="form-section-head"><span>01</span><div><strong>Dados pessoais</strong><small>Identificação e contato do aluno</small></div></div><div class="form-grid"><label class="span-2">Nome completo<input name="name" autocomplete="name" required value="${attr(s.name || '')}" placeholder="Ex.: João da Silva"></label><label>WhatsApp<input name="phone" class="phone-mask" autocomplete="tel" required value="${attr(s.phone || '')}" placeholder="(14) 99999-9999"><small class="field-help">Verificaremos possíveis cadastros repetidos.</small></label><div id="duplicateNotice" class="duplicate-notice span-2" role="status" aria-live="polite" hidden></div><label>Data de nascimento<input name="birth_date" type="date" value="${attr(s.birth_date || '')}"></label><label>Data de início<input name="start_date" type="date" required value="${attr(s.start_date || today())}"></label><label>Status<select name="status"><option value="active" ${(s.status || 'active') === 'active' ? 'selected' : ''}>Ativo</option><option value="inactive" ${s.status === 'inactive' ? 'selected' : ''}>Inativo</option></select></label></div></div>
    <div class="form-section"><div class="form-section-head"><span>02</span><div><strong>Endereço</strong><small>Digite o CEP para preencher rua, bairro, cidade e estado</small></div></div><div class="form-grid address-grid"><label>CEP<div class="input-button"><input name="cep" id="cep" class="cep-mask" value="${attr(s.cep || '')}" placeholder="00000-000"><button type="button" id="buscarCep">Buscar</button></div><small class="field-help" id="cepStatus">Consulta pelo ViaCEP; também pode preencher manualmente.</small></label><label>Rua / Logradouro<input name="street" id="street" value="${attr(s.street || '')}" placeholder="Rua, avenida..."></label><label>Número<input name="number" value="${attr(s.number || '')}" placeholder="123"></label><label>Complemento<input name="complement" value="${attr(s.complement || '')}" placeholder="Apto, bloco..."></label><label>Bairro<input name="neighborhood" id="neighborhood" value="${attr(s.neighborhood || '')}"></label><label>Cidade<input name="city" id="city" value="${attr(s.city || '')}"></label><label>Estado<input name="state" id="state" maxlength="2" value="${attr(s.state || '')}" placeholder="SP"></label>${addressPreview ? `<div class="span-2 address-preview">Endereço atual: <strong>${htmlEscape(addressPreview)}</strong></div>` : ''}</div></div>
    <div class="form-section"><div class="form-section-head"><span>03</span><div><strong>Plano e cobrança</strong><small>Configuração financeira individual</small></div></div><div class="form-grid"><label>Plano<select name="plan_id" id="planSelect" required>${plans.map(p => `<option value="${p.id}" data-value="${p.default_value}" data-months="${Number(p.months) || 1}" ${Number(s.plan_id) === Number(p.id) ? 'selected' : ''}>${htmlEscape(p.name)} · ${money(p.default_value)}</option>`).join('')}</select></label><label>Valor do plano / cobrança<input name="monthly_value" id="monthlyValue" type="number" step="0.01" min="0" required value="${attr(s.monthly_value ?? plans[0]?.default_value ?? 0)}"></label><label>Dia do vencimento<input name="due_day" id="dueDay" type="number" min="1" max="31" required value="${attr(s.due_day ?? Number(today().slice(-2)))}"><small class="field-help">${isEdit ? 'Você pode alterar o dia das próximas cobranças.' : 'Sugerido automaticamente pelo dia do cadastro. Pode alterar de 1 a 31.'}</small></label><div class="span-2 due-preview" id="duePreview" role="status" aria-live="polite"><strong>Próximo vencimento previsto</strong><span>Calculando...</span><small>Estimativa para novas cobranças. Mensalidades já lançadas ou pagas não são alteradas nesta tela.</small></div><label class="span-2">Observações<textarea name="notes" rows="4" placeholder="Restrições, preferências, recados administrativos...">${htmlEscape(s.notes || '')}</textarea></label></div></div>
    <div class="form-actions sticky-actions"><a class="btn secondary" href="${cancelHref}">Cancelar</a><button class="btn primary">${isEdit ? 'Salvar alterações' : 'Cadastrar aluno'}</button></div>
  </form>`;
}
function exerciseRow(i = {}) {
  return `<div class="exercise-row"><input type="hidden" name="item_id" value="${Number(i.id) || ''}"><span class="drag-handle">⋮⋮</span><label>Bloco<input name="workout_label" value="${attr(i.workout_label || 'Treino A')}" placeholder="Treino A"></label><label class="exercise-name">Exercício<input name="exercise" value="${attr(i.exercise || '')}" required placeholder="Nome do exercício"></label><label>Séries<input name="sets" value="${attr(i.sets || '3')}" required></label><label>Repetições<input name="reps" value="${attr(i.reps || '10–12')}" required></label><label>Descanso<input name="rest" value="${attr(i.rest || '60s')}"></label><label class="exercise-item-note">Recado do professor <small>Visível para todos os alunos com esta ficha</small><textarea name="exercise_notes" maxlength="500" rows="2" placeholder="Ex.: ajuste o banco na posição 3; mantenha o movimento controlado.">${htmlEscape(i.exercise_notes || '')}</textarea></label><label class="exercise-suggested-load">Carga sugerida (opcional)<input name="suggested_load" maxlength="30" value="${attr(i.suggested_load || '')}" placeholder="Ex.: 20 kg / cada lado"></label><button type="button" class="remove-exercise" title="Remover exercício" aria-label="Remover exercício"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 3h4l1 4H9l1-4ZM7 7l1 13h8l1-13M10 11v5m4-5v5"/></svg></button></div>`;
}
function exerciseCover(name, category, compact = false) {
  const label = String(category || 'Treino');
  const initials = label === 'Pernas' ? 'PER' : label === 'Costas' ? 'COS' : label === 'Peito' ? 'PEI' : label === 'Ombros' ? 'OMB' : label === 'Braços' ? 'BRA' : 'CORE';
  return `<div class="exercise-cover ${compact ? 'compact' : ''}" data-cover-category="${attr(label)}" role="img" aria-label="Capa gráfica: ${attr(name)}"><span class="exercise-cover-orbit" aria-hidden="true"></span><span class="exercise-cover-mark" aria-hidden="true">ST<span>·</span> ${initials}</span><strong>${htmlEscape(name)}</strong><small>GUIA DE MOVIMENTO</small></div>`;
}
function exerciseSteps(steps) {
  return `<ol class="exercise-steps">${steps.map((step,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span>${htmlEscape(step)}</li>`).join('')}</ol>`;
}
function youtubeExerciseSearch(name) {
  const query=`${String(name||'').trim().slice(0,150)} execução do exercício`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
function youtubeExecutionLink(name) {
  return `<a class="exercise-youtube-link" href="${attr(youtubeExerciseSearch(name))}" target="_blank" rel="noopener noreferrer" aria-label="Pesquisar execução de ${attr(name)} no YouTube">▶ Pesquisar execução no YouTube ↗</a>`;
}
function workoutForm(t = {}, items = [], action = '/treinos', title = 'Novo treino') {
  const rows = items.length ? items : [{ workout_label: 'Treino A', exercise: '', sets: '3', reps: '10–12', rest: '60s' }];
  const categories = [...new Set(exerciseLibrary.map(({category}) => category))];
  const library = exerciseLibrary.map(({category,name}) => `<div class="exercise-library-item exercise-visual-item" data-library-exercise="${attr(name)}" data-library-category="${attr(category)}">
    ${exerciseCover(name,category,true)}
    <div class="exercise-visual-copy"><strong>${htmlEscape(name)}</strong><small>${htmlEscape(category)} · guia de execução</small></div>
    <div class="exercise-visual-actions"><button type="button" class="exercise-favorite" data-library-favorite aria-pressed="false" aria-label="Favoritar ${attr(name)}" title="Favoritar este exercício">☆</button><button type="button" class="exercise-add-visual" data-library-add>+ Adicionar</button><button type="button" class="exercise-preview-visual" data-preview-name="${attr(name)}" data-preview-category="${attr(category)}" data-preview-steps="${attr(JSON.stringify(exercisePresentation(name).steps))}" data-preview-video="${attr(exercisePresentation(name).video || '')}" data-preview-youtube="${attr(youtubeExerciseSearch(name))}">Ver guia</button></div>
  </div>`).join('');
  return `<form class="form-shell workout-builder" method="post" action="${action}"><div class="form-hero"><div><span class="eyebrow">MONTAGEM DE TREINO</span><h2>${htmlEscape(title)}</h2><p>Monte fichas A/B/C/D, use a biblioteca rápida e salve como modelo reutilizável.</p></div><div class="workout-badge">🏋️</div></div><div class="form-section"><div class="form-section-head"><span>01</span><div><strong>Informações do modelo</strong><small>Nome, público e nível</small></div></div><div class="form-grid"><label class="span-2">Nome do treino<input name="name" required value="${attr(t.name || '')}" placeholder="Ex.: Hipertrofia ABC - João"></label><label>Público<select name="audience"><option ${t.audience === 'Todos' ? 'selected' : ''}>Todos</option><option ${t.audience === 'Masculino' ? 'selected' : ''}>Masculino</option><option ${t.audience === 'Feminino' ? 'selected' : ''}>Feminino</option></select></label><label>Nível<select name="level"><option ${t.level === 'Iniciante' ? 'selected' : ''}>Iniciante</option><option ${t.level === 'Intermediário' ? 'selected' : ''}>Intermediário</option><option ${t.level === 'Avançado' ? 'selected' : ''}>Avançado</option><option ${t.level === 'Adaptado' ? 'selected' : ''}>Adaptado</option><option ${t.level === 'Personalizado' ? 'selected' : ''}>Personalizado</option></select></label><label class="span-2">Orientações gerais<textarea name="notes" rows="3" placeholder="Ex.: manter 1–2 repetições na reserva e priorizar execução controlada.">${htmlEscape(t.notes || '')}</textarea></label></div></div><div class="form-section workout-builder-section"><div class="form-section-head"><span>02</span><div><strong>Exercícios</strong><small>Adicione pela biblioteca ou crie um exercício manualmente</small></div><button type="button" class="btn secondary small" id="addExercise">+ Exercício manual</button></div><div class="workout-builder-grid"><aside class="exercise-library"><div class="exercise-library-head"><strong>Biblioteca de exercícios</strong><small>Escolha exercícios para a ficha. Seus favoritos ficam salvos neste navegador.</small><input id="exerciseLibrarySearch" type="search" placeholder="Buscar exercício..." autocomplete="off"><label class="exercise-favorites-filter"><input type="checkbox" id="exerciseFavoritesOnly"> Mostrar só favoritos <span aria-hidden="true">★</span></label></div><div class="exercise-category-filters"><button type="button" class="active" data-exercise-category="Todos">Todos</button>${categories.map(c=>`<button type="button" data-exercise-category="${attr(c)}">${htmlEscape(c)}</button>`).join('')}</div><div id="exerciseLibraryList" class="exercise-library-list">${library}</div><div class="exercise-library-empty" id="exerciseLibraryEmpty" hidden>Nenhum exercício encontrado.</div><small class="exercise-library-disclaimer">Orientações gerais; o professor ajusta o movimento e a carga para cada aluno.</small></aside><section class="workout-sheet"><div class="workout-sheet-tools"><div><strong>Sua ficha</strong><small id="exerciseCount">${rows.length} exercício(s)</small></div><div class="quick-blocks"><span>Adicionar no bloco:</span>${['Treino A','Treino B','Treino C','Treino D'].map((label,i)=>`<button type="button" class="${i===0?'active':''}" data-workout-block="${label}">${label.replace('Treino ','')}</button>`).join('')}</div></div><div id="exerciseRows" class="exercise-editor">${rows.map(i => exerciseRow(i)).join('')}</div></section></div></div><dialog id="exerciseDemoDialog" class="exercise-demo-dialog" aria-labelledby="exerciseDemoTitle"><div class="exercise-demo-dialog-head"><strong id="exerciseDemoTitle">Demonstração</strong><button type="button" data-preview-close aria-label="Fechar demonstração">✕</button></div><div id="exerciseDemoMedia"></div><div id="exerciseDemoInstructions"></div><small>Confirme a execução e os ajustes individuais com o professor.</small></dialog><div class="form-actions sticky-actions"><a class="btn secondary" href="${t.id ? `/treinos/${t.id}` : '/treinos'}">Cancelar</a><button class="btn primary">${t.id ? 'Salvar treino' : 'Criar treino'}</button></div></form>`;
}


// V1.2 — área do aluno: conta e sessão próprias, isoladas do login administrativo.
const PORTAL_COOKIE = 'st_student_session';
function portalCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${PORTAL_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}
function portalClearCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${PORTAL_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
function portalLoginCsrfName(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-st_portal_login_csrf' : 'st_portal_login_csrf';
}
function portalLoginCsrfCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${portalLoginCsrfName(request)}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${secure}`;
}
async function portalLoginCsrfAllowed(request) {
  const token = parseCookies(request)[portalLoginCsrfName(request)];
  const body = await request.clone().text();
  return /^[a-f0-9]{64}$/.test(token || '') && body.length < 10000 &&
    safeEqualString(token, new URLSearchParams(body).get('portal_login_csrf') || '');
}
async function currentStudent(request, env) {
  const token = parseCookies(request)[PORTAL_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const student = await dbGet(env.DB, `SELECT s.id,s.name,s.status,a.must_change_password,a.password_hash,p.csrf_token,p.created_at
    FROM student_portal_sessions p JOIN student_portal_accounts a ON a.student_id=p.student_id
    JOIN students s ON s.id=p.student_id
    WHERE p.token_hash=? AND p.expires_at>? AND a.enabled=1 AND s.status='active'`, hash, new Date().toISOString());
  if (!student) return null;
  const created = Date.parse(String(student.created_at).replace(' ', 'T') + (String(student.created_at).includes('Z') ? '' : 'Z'));
  if (!Number.isFinite(created) || Date.now() - created > SESSION_HOURS * 3600000) return null;
  return student;
}
async function studentCsrfAllowed(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return false;
  const body = await request.clone().text();
  if (body.length > 10000) return false;
  const token = new URLSearchParams(body).get('csrf_token');
  return Boolean(token && safeEqualString(student.csrf_token, token));
}
function portalLayout(title, content, g, student = null) {
  const toggle = '<button type="button" class="theme-toggle" data-theme-toggle aria-label="Alternar tema" aria-pressed="false"><span class="theme-icon">🌙</span><span class="theme-label">Tema</span></button>';
  const pwaHead = student || title === 'Entrar' ? '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icons/super-treino-apple-180.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default">' : '';
  const installButton = student ? '<button type="button" class="btn secondary small portal-install" data-install-app hidden>Instalar app</button>' : '';
  const firstPaint = `<script>(function(){try{var t=localStorage.getItem('super-treino-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){}})();</script>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#12231d"><title>${htmlEscape(title)} · ${htmlEscape(g.gym_name)}</title>${firstPaint}${pwaHead}<link rel="stylesheet" href="/style.css?v=190"></head><body class="student-app"><div class="portal-container"><header class="portal-top"><a href="${student ? '/app' : '/app/entrar'}" class="portal-brand"><span class="portal-logo">ST</span><span><strong>${htmlEscape(g.gym_name)}</strong><small>Seu espaço de treinos</small></span></a><div class="portal-top-actions">${installButton}${toggle}${student ? `<form method="post" action="/app/sair"><input type="hidden" name="csrf_token" value="${attr(student.csrf_token)}"><button class="btn secondary small" type="submit">Sair</button></form>` : `<a class="btn secondary small" href="/login">Sou professor</a>`}</div></header>${student ? `<nav class="portal-primary-nav" aria-label="Navegação do aluno"><a href="/app" class="${title==='Meus treinos'?'active':''}" ${title==='Meus treinos'?'aria-current="page"':''}><span>🏋️</span> Treinos</a><a href="/app/historico" class="${title==='Meu histórico'?'active':''}" ${title==='Meu histórico'?'aria-current="page"':''}><span>📅</span> Histórico</a><a href="/app/mensalidade" class="${title==='Minha mensalidade'?'active':''}" ${title==='Minha mensalidade'?'aria-current="page"':''}><span>💳</span> Mensalidade</a></nav>` : ''}<main class="portal-main">${content}</main><footer class="portal-footer">Ficha orientativa: peça ajuda ao seu professor para adaptar execução ou carga.<small class="portal-version">Versão 1.9.0</small></footer></div><script src="/app.js?v=190"></script></body></html>`;
}
function exerciseDemoMarkup(name) {
  const guide = exercisePresentation(name);
  const steps = guide?.steps || ['Peça ao professor uma demonstração e orientações específicas para este exercício.'];
  const visual = guide ? exerciseCover(guide.name,guide.category) : `<div class="exercise-cover custom"><span class="exercise-cover-mark">ST · TREINO</span><strong>${htmlEscape(name)}</strong><small>EXERCÍCIO PERSONALIZADO</small></div>`;
  const media = guide?.video
    ? `<video class="exercise-video" controls muted loop playsinline preload="none" data-video-src="${attr(guide.video)}" aria-label="Demonstração de ${attr(name)}"></video>`
    : `${visual}<div class="exercise-media-caption">Demonstração em vídeo em preparação. Peça ao professor para mostrar a execução.</div>`;
  return `<details class="portal-demo-details"><summary>Ver guia de execução</summary><div class="portal-demo-inner">${media}<strong>Como fazer</strong>${exerciseSteps(steps)}<small>Estas dicas são gerais. Siga os ajustes e a carga definidos pelo professor.</small></div></details>`;
}
function portalWorkoutContent(student, assigned, items, checks, selected, preview = false) {
  if (!assigned) return `<div class="portal-welcome"><span class="eyebrow">OLÁ, ${htmlEscape(student.name.split(' ')[0])}</span><h1>Sua jornada começa aqui 💪</h1><p>O professor ainda não vinculou uma ficha à sua matrícula. Assim que ela for atribuída, seus treinos aparecerão neste espaço.</p>${preview ? `<a class="btn secondary" href="/alunos/${student.id}">Voltar à ficha administrativa</a>` : ''}</div>`;
  const labels = [...new Set(items.map(i => i.workout_label))];
  const label = labels.includes(selected) ? selected : labels[0];
  const done = new Set(checks.map(c => Number(c.item_id)));
  const count = items.filter(i => done.has(Number(i.id))).length;
  const section = items.filter(i => i.workout_label === label);
  const sectionDone=section.filter(i=>done.has(Number(i.id))).length;
  const base = preview ? `/alunos/${student.id}/previa` : '/app';
  const tabs = labels.map(l => `<a class="portal-tab ${l === label ? 'selected' : ''}" href="${base}?bloco=${encodeURIComponent(l)}">${htmlEscape(l)} <span>${items.filter(i => i.workout_label === l).length}</span></a>`).join('');
  return `<div class="portal-welcome"><span class="eyebrow">${preview ? 'PRÉVIA DO PROFESSOR' : 'ÁREA DO ALUNO'}</span><h1>Olá, ${htmlEscape(student.name.split(' ')[0])}! 👋</h1><p>Seu treino está aqui. Mantenha a técnica e siga as orientações do professor.</p><div class="portal-summary"><span>FICHA ATUAL <strong>${htmlEscape(assigned.template_name)}</strong></span><span>EXERCÍCIOS <strong>${items.length}</strong></span><span>${preview?'PRÉVIA':'HOJE'} <strong>${count}/${items.length}</strong></span></div></div>
  ${assigned.template_notes ? `<div class="portal-guidance"><strong>Orientações gerais</strong><p>${htmlEscape(assigned.template_notes)}</p></div>` : ''}${assigned.student_notes ? `<div class="portal-guidance"><strong>Orientações para você</strong><p>${htmlEscape(assigned.student_notes)}</p></div>` : ''}
  <nav class="portal-tabs" aria-label="Blocos de treino">${tabs}</nav><div class="portal-block-head"><div><h2>${htmlEscape(label || 'Sua ficha')}</h2><p>${section.length} exercícios · ${preview ? 'Visualização do professor' : `${sectionDone} concluído(s) hoje`}</p></div><span class="badge neutral">${htmlEscape(assigned.level || 'Seu treino')}</span></div>
  ${!preview&&section.length?`<a class="btn primary portal-start" href="/app/foco/${(section.find(it=>!done.has(Number(it.id)))||section[0]).id}">▶ Começar ${htmlEscape(label)}</a>`:''}
  ${!preview&&section.length?`<div class="portal-session-progress" aria-label="Progresso deste bloco"><span>Progresso do ${htmlEscape(label)}: <b>${sectionDone}/${section.length}</b></span><div class="st-progress-track"><div class="st-progress-fill" style="width:${percent(sectionDone,section.length)}%"></div></div></div>`:''}
  <div class="portal-exercises">${section.map((it,i) => {const isDone = done.has(Number(it.id));const guide=exerciseGuide(it.exercise);return `<article class="portal-exercise ${isDone ? 'is-done' : ''}"><div class="portal-exercise-number">${String(i+1).padStart(2,'0')}</div><div class="portal-exercise-body"><div class="portal-exercise-title-row"><h3>${htmlEscape(it.exercise)}</h3>${guide?'<span class="portal-has-gif">GUIA</span>':''}</div><div class="portal-exercise-prescription"><span><b>${htmlEscape(it.sets)}</b> séries</span><span><b>${htmlEscape(it.reps)}</b> repetições</span><span><b>${htmlEscape(it.rest || '—')}</b> descanso</span></div>${it.suggested_load?`<small class="portal-load-hint">Carga sugerida: ${htmlEscape(it.suggested_load)}</small>`:''}${it.exercise_notes ? `<div class="portal-exercise-note"><strong>Recado do professor</strong><p>${htmlEscape(it.exercise_notes)}</p></div>` : ''}${exerciseDemoMarkup(it.exercise)}${youtubeExecutionLink(it.exercise)}${!preview?`<a class="portal-focus-link" href="/app/foco/${it.id}">Abrir exercício e registrar séries →</a>`:''}</div>${preview ? `<span class="badge neutral">Prévia</span>` : `<form method="post" action="/app/exercicios/${it.id}/concluir" class="portal-done-form"><input type="hidden" name="csrf_token" value="${attr(student.csrf_token)}"><input type="hidden" name="bloco" value="${attr(label)}"><input type="hidden" name="done" value="${isDone ? '0' : '1'}"><button class="portal-done-btn ${isDone?'checked':''}" type="submit">${isDone?'✓ Feito':'○ Concluir'}</button></form>`}</article>`}).join('') || '<div class="empty">Nenhum exercício neste bloco.</div>'}</div>
  <p class="portal-bottom-note">${preview?'Prévia da ficha: marcações individuais não são alteradas nesta tela.':'Concluiu o treino? Você pode revisar ou desmarcar os exercícios de hoje. Os dados ficam vinculados à sua matrícula.'}</p>${preview ? `<a class="btn secondary" href="/alunos/${student.id}">← Voltar à ficha do aluno</a>` : '<a class="btn secondary small" href="/app/historico">📅 Ver meu histórico</a>'}`;
}

// V1.4: a aba de mensalidade é exclusivamente LEITURA e usa dados da matrícula
// autenticada. Nunca criar/fabricar cobranças, nem inferir "pago" a partir da data.
function monthAdd(ref, offset) {
  const [y,m]=String(ref).split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1+offset,1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}`;
}
function estimatedNextDue(student, issued) {
  const period=Math.max(1,Math.min(24,Number(student.plan_months)||1));
  const now=today(), ref=currentReference();
  const recent=issued.reduce((best,i)=>(!best||i.reference_month>best.reference_month)?i:best,null);
  const startRef=String(student.start_date||ref).slice(0,7);
  let target=recent ? monthAdd(recent.reference_month,period) : startRef;
  if (target<ref) {
    // Mantém a periodicidade ancorada à última cobrança ou ao início do plano.
    const [ty,tm]=target.split('-').map(Number),[cy,cm]=ref.split('-').map(Number);
    const jumps=Math.floor(((cy*12+cm)-(ty*12+tm))/period);
    target=monthAdd(target,Math.max(0,jumps)*period);
  }
  let candidate=dueDateFor(student.due_day,target);
  if(candidate<now)candidate=dueDateFor(student.due_day,monthAdd(target,period));
  return candidate;
}
function portalInvoiceContent(student,issued,g) {
  const ordered=[...issued].sort((a,b)=>a.due_date.localeCompare(b.due_date));
  const pending=ordered.filter(i=>i.status==='open');
  const overdue=pending.filter(i=>i.due_date<today());
  const current=issued.find(i=>i.reference_month===currentReference());
  const lastPaid=[...issued].filter(i=>i.status==='paid').sort((a,b)=>String(b.paid_at||b.due_date).localeCompare(String(a.paid_at||a.due_date)))[0];
  const target=overdue[0]||pending[0]||null;
  const date=target?target.due_date:estimatedNextDue(student,issued);
  const actual=Boolean(target);
  const status=actual?invoiceStatus(target):'Previsão';
  const statusStyle=status==='Pago'?'success':status==='Vencido'?'danger':status.startsWith('Vence')?'warning':'neutral';
  const help=g.whatsapp?`<a class="btn whatsapp" href="${whatsappLink(g.whatsapp,`Olá! Gostaria de confirmar minha mensalidade na ${g.gym_name}. Minha matrícula é ${student.id}.`)}" target="_blank" rel="noopener noreferrer">Falar com a recepção</a>`:'<p>Em caso de dúvidas, consulte a recepção da academia.</p>';
  return `<div class="portal-welcome portal-billing-welcome"><span class="eyebrow">MINHA MENSALIDADE</span><h1>Vencimentos e pagamentos 💳</h1><p>Consulte suas cobranças sem precisar falar com a recepção.</p><div class="portal-summary"><span>PLANO <strong>${htmlEscape(student.plan_name||'Meu plano')}</strong></span><span>VALOR CADASTRADO <strong>${money(student.monthly_value)}</strong></span></div></div>
    <div class="portal-billing-grid"><section class="portal-billing-card ${statusStyle}"><span class="portal-billing-label">${actual?(overdue.length?'Cobrança vencida mais antiga':'Próxima cobrança em aberto'):'Próxima data estimada'}</span><strong class="portal-billing-date">${brDate(date)}</strong><span class="badge ${statusStyle}">${htmlEscape(status)}</span>${actual?`<p>Referência: ${htmlEscape(target.reference_month)} · Valor lançado: <strong>${money(target.amount)}</strong></p>`:`<p>Estimativa com base no seu dia de vencimento (dia ${Number(student.due_day)||10}) e na periodicidade do plano. <strong>Ainda não é uma cobrança lançada.</strong></p>`}${overdue.length>1?`<p>Há ${overdue.length} mensalidades vencidas em aberto. Consulte a lista abaixo.</p>`:''}</section>
    <section class="portal-billing-card"><span class="portal-billing-label">Mensalidade deste mês</span><strong class="portal-billing-current">${current?money(current.amount):'Não lançada'}</strong><p>${current?`Vencimento: ${brDate(current.due_date)} · ${htmlEscape(invoiceStatus(current))}`:'Nenhuma cobrança registrada para este mês. Não significa pagamento pendente.'}</p>${lastPaid?`<div class="portal-last-paid">Último pagamento registrado: <strong>${brDate(lastPaid.paid_at)} · ${money(lastPaid.amount)}</strong></div>`:''}</section></div>
    <section class="panel portal-invoice-history"><div class="panel-head"><div><h2>Últimas mensalidades</h2><p>Histórico da sua matrícula. Somente a academia pode lançar ou confirmar pagamentos.</p></div></div>${issued.length?`<div class="portal-invoice-list">${issued.slice(0,12).map(i=>`<div class="portal-invoice-row"><div><strong>${htmlEscape(referenceLabel(i.reference_month))}</strong><small>Vence em ${brDate(i.due_date)}${i.status==='paid'?` · Pago em ${brDate(i.paid_at)}`:''}</small></div><div class="portal-invoice-right"><strong>${money(i.amount)}</strong>${badge(invoiceStatus(i))}</div></div>`).join('')}</div>`:'<div class="empty">Ainda não há cobranças lançadas para sua matrícula.</div>'}</section>
    <div class="portal-billing-help"><p>Esta aba é apenas informativa. Pagamento via Pix, dinheiro ou cartão é registrado pela academia, não por este aplicativo.</p>${help}</div>`;
}

// V1.3: o mesmo cálculo alimenta a ficha administrativa e o painel completo.
// Somente marcações da ficha ativa entram no progresso de hoje; o histórico
// guarda fotografias das fichas anteriores para não reescrever dias passados.
function percent(done, total) {
  return total > 0 ? Math.max(0, Math.min(100, Math.round(100 * done / total))) : 0;
}
function progressTrack(done, total) {
  const value = percent(done, total);
  return `<div class="st-progress-track" role="progressbar" aria-label="Progresso dos exercícios" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><div class="st-progress-fill" style="width:${value}%"></div></div>`;
}
async function loadStudentProgress(env, studentId, assigned) {
  const items = assigned ? await dbAll(env.DB,
    'SELECT id,workout_label,exercise FROM workout_template_items WHERE template_id=? ORDER BY sort_order,id',assigned.template_id) : [];
  const checks = assigned ? await dbAll(env.DB, `SELECT c.item_id FROM student_exercise_checks c
    JOIN workout_template_items i ON i.id=c.item_id WHERE c.student_id=? AND c.day=? AND i.template_id=?`,
    studentId,today(),assigned.template_id) : [];
  const doneIds = new Set(checks.map(c=>Number(c.item_id)));
  const blocks = [...new Set(items.map(i=>i.workout_label))].map(label=>{
    const exercises = items.filter(i=>i.workout_label===label).map(i=>({...i,done:doneIds.has(Number(i.id))}));
    return {label,exercises,total:exercises.length,done:exercises.filter(i=>i.done).length};
  });
  const history = await dbAll(env.DB,`SELECT day,workout_label,template_name,total_exercises,completed_exercises,updated_at
    FROM student_workout_daily WHERE student_id=? AND completed_exercises>0
    ORDER BY day DESC,updated_at DESC,id DESC LIMIT 90`,studentId);
  return {blocks,history,total:items.length,done:items.filter(i=>doneIds.has(Number(i.id))).length,lastDay:history[0]?.day || null};
}
function progressOverview(id,progress) {
  return `<div class="panel st-progress-overview"><div class="panel-head"><div><h2>📊 Acompanhamento do aluno</h2><p>Marcações da área do aluno registradas hoje (${brDate(today())}). Atualize a página para ver as novidades.</p></div><a href="/alunos/${id}/acompanhamento">Ver histórico →</a></div>
    <div class="st-progress-hero"><strong>${progress.done}/${progress.total}</strong><span>exercícios marcados hoje · ${percent(progress.done,progress.total)}%</span><small>Última atividade: ${brDate(progress.lastDay)}</small></div>
    ${progressTrack(progress.done,progress.total)}
    <div class="st-block-chips">${progress.blocks.map(b=>`<span>${htmlEscape(b.label)} <strong>${b.done}/${b.total}</strong></span>`).join('') || '<span>Nenhuma ficha ativa</span>'}</div>
    <a class="btn secondary small" href="/alunos/${id}/acompanhamento">Ver exercícios concluídos e histórico</a>
    <small class="st-progress-note">Percentual referente à ficha ativa inteira. Marcação de exercício não confirma carga nem execução correta.</small></div>`;
}
function historyTable(history,empty='Ainda não há exercícios marcados pelo aluno.') {
  return history.length ? `<div class="table-wrap"><table class="st-history-table"><thead><tr><th>Data</th><th>Ficha</th><th>Treino</th><th>Exercícios marcados</th><th>Progresso registrado</th></tr></thead><tbody>${history.map(h=>`<tr><td>${brDate(h.day)}</td><td>${htmlEscape(h.template_name)}</td><td>${htmlEscape(h.workout_label)}</td><td><strong>${Number(h.completed_exercises)}/${Number(h.total_exercises)}</strong></td><td>${percent(Number(h.completed_exercises),Number(h.total_exercises))}%${Number(h.completed_exercises)>=Number(h.total_exercises)&&Number(h.total_exercises)>0?' · bloco completo':''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${htmlEscape(empty)}</div>`;
}

const leadStatuses = ['Novo', 'Conversando', 'Visita marcada', 'Visitou', 'Matriculou', 'Não interessado'];
function leadForm(l = {}, action = '/leads', title = 'Novo futuro cliente') {
  return `<form class="form-shell compact-form" method="post" action="${action}"><div class="form-hero"><div><span class="eyebrow">FUNIL COMERCIAL</span><h2>${htmlEscape(title)}</h2><p>Registre objetivo, interesse e estágio do contato.</p></div><div class="workout-badge">🎯</div></div><div class="form-section"><div class="form-grid"><label>Nome<input name="name" required value="${attr(l.name || '')}"></label><label>WhatsApp<input name="phone" class="phone-mask" required value="${attr(l.phone || '')}"></label><label>Data do contato<input name="contact_date" type="date" value="${attr(l.contact_date || today())}" required></label><label>Status<select name="status">${leadStatuses.map(s => `<option ${l.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Objetivo<input name="goal" value="${attr(l.goal || '')}" placeholder="Ex.: emagrecimento"></label><label>Interesse<input name="interest" value="${attr(l.interest || '')}" placeholder="Ex.: plano mensal"></label><label class="span-2">Observações<textarea name="notes" rows="4">${htmlEscape(l.notes || '')}</textarea></label></div></div><div class="form-actions"><a class="btn secondary" href="/leads">Cancelar</a><button class="btn primary">Salvar</button>${l.id ? `<button class="btn danger" form="deleteLead" type="submit">Excluir</button>` : ''}</div></form>${l.id ? `<form id="deleteLead" method="post" action="/leads/${l.id}/excluir" data-confirm="Excluir este futuro cliente?"></form>` : ''}`;
}

const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    if (typeof r.pattern === 'string' && r.pattern === pathname) return { handler: r.handler, params: {} };
    if (r.pattern instanceof RegExp) { const m = pathname.match(r.pattern); if (m) return { handler: r.handler, params: m.groups || {} }; }
  }
  return null;
}

// CONFIGURAÇÃO INICIAL
route('GET', '/setup', async (request, env) => {
  const count = Number((await dbGet(env.DB, 'SELECT COUNT(*) c FROM users'))?.c || 0);
  if (count > 0) return redirect('/login');
  const url = new URL(request.url);
  const g = await gym(env);
  if (!env.SETUP_KEY) {
    return htmlResponse(layout('Configuração necessária', `<div class="login-wrap simple"><div class="login-panel"><div class="login-card"><div class="brand-mark large">ST</div><h1>Falta configurar a chave de instalação</h1><p>No terminal do projeto, execute <code>npx wrangler secret put SETUP_KEY</code>, escolha uma chave longa e depois abra <code>/setup?key=SUA_CHAVE</code>.</p></div></div></div>`, '', null, '', g), 503);
  }
  const key = url.searchParams.get('key') || '';
  if (!safeEqualString(key, env.SETUP_KEY)) return htmlResponse('<!doctype html><meta charset="utf-8"><title>Acesso negado</title><h1>Acesso negado</h1>', 403);
  const content = `<div class="login-wrap simple"><div class="login-panel"><div class="login-card"><div class="brand-mark large">ST</div><span class="eyebrow">PRIMEIRA CONFIGURAÇÃO</span><h1>Crie o administrador</h1><p>Essa conta será usada para entrar no sistema online.</p><form method="post" action="/setup" class="form login-form"><input type="hidden" name="setup_key" value="${attr(key)}"><label>Seu nome<input name="name" required autocomplete="name" placeholder="Administrador"></label><label>E-mail<input name="email" type="email" required autocomplete="email" placeholder="seuemail@exemplo.com"></label><label>Senha<input name="password" type="password" minlength="10" required autocomplete="new-password" placeholder="mínimo 10 caracteres"></label><label>Confirmar senha<input name="confirm_password" type="password" minlength="10" required autocomplete="new-password"></label><button class="btn primary full">Criar administrador</button></form><div class="demo-tip">Depois que a primeira conta for criada, esta tela de instalação é desativada automaticamente.</div></div></div></div>`;
  return htmlResponse(layout('Primeiro acesso', content, '', null, '', g));
});
route('POST', '/setup', async (request, env) => {
  const count = Number((await dbGet(env.DB, 'SELECT COUNT(*) c FROM users'))?.c || 0);
  if (count > 0) return redirect('/login');
  const p = await bodyParams(request);
  if (!env.SETUP_KEY || !safeEqualString(p.get('setup_key') || '', env.SETUP_KEY)) return htmlResponse('Acesso negado', 403);
  const name = String(p.get('name') || '').trim();
  const email = String(p.get('email') || '').trim().toLowerCase();
  const password = String(p.get('password') || '');
  if (!name || !email.includes('@') || password.length < 10 || password !== String(p.get('confirm_password') || '')) {
    return htmlResponse('<!doctype html><meta charset="utf-8"><h1>Dados inválidos</h1><p>Confira nome, e-mail e senha. A senha deve ter pelo menos 10 caracteres e as duas senhas precisam ser iguais.</p><a href="javascript:history.back()">Voltar</a>', 400);
  }
  const hash = await hashPassword(password);
  await dbRun(env.DB, 'INSERT INTO users (name,email,password_hash) VALUES (?,?,?)', name, email, hash);
  await dbRun(env.DB, 'DELETE FROM sessions');
  await dbRun(env.DB, 'DELETE FROM login_attempts');
  return redirect(`/login?ok=${encodeURIComponent('Administrador criado. Agora faça o login.')}`);
});

// LOGIN
route('GET', '/login', async (request, env) => {
  if (await currentUser(request, env)) return redirect('/');
  const g = await gym(env), url = new URL(request.url);
  const users = Number((await dbGet(env.DB, 'SELECT COUNT(*) c FROM users'))?.c || 0);
  const logo = g.logo_data ? `<img class="login-logo" src="${attr(g.logo_data)}" alt="">` : `<div class="brand-mark large">${htmlEscape(initials(g.gym_name))}</div>`;
  const setupNote = !users ? `<div class="demo-tip">Ainda não existe administrador. Conclua a configuração inicial pelo endereço <strong>/setup?key=SUA_CHAVE</strong>.</div>` : '';
  const loginCsrf = randomToken();
  const page = `<div class="login-wrap"><div class="login-side"><div class="login-copy"><span class="eyebrow light">SUPER TREINO ONLINE</span><h2>Sua academia acessível de qualquer lugar.</h2><p>Alunos, cobranças, treinos, leads, WhatsApp, recibos e relatórios no mesmo sistema, com banco na nuvem.</p><div class="login-features"><span>✓ Celular e computador</span><span>✓ HTTPS automático</span><span>✓ Banco Cloudflare D1</span></div></div></div><div class="login-panel"><div class="login-card">${flashFrom(url)}${logo}<h1>${htmlEscape(g.gym_name)}</h1><p>${htmlEscape(g.slogan || 'Acesso administrativo')}</p><form method="post" action="/login" class="form login-form"><input type="hidden" name="login_csrf_token" value="${loginCsrf}"><label>E-mail<input name="email" type="email" required autocomplete="email"></label><label>Senha<input name="password" type="password" required autocomplete="current-password"></label><button class="btn primary full">Entrar no sistema</button></form>${setupNote}</div></div></div>`;
  return htmlResponse(layout('Login', page, '', null, '', g), 200, { 'Set-Cookie': loginCsrfCookie(loginCsrf, request) });
});
route('POST', '/login', async (request, env) => {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await loginBlocked(env, ip)) {
    const g = await gym(env);
    return htmlResponse(layout('Muitas tentativas', `<div class="login-wrap simple"><div class="login-panel"><div class="login-card"><div class="alert danger-box">Muitas tentativas de login. Aguarde cerca de 15 minutos e tente novamente.</div><a class="btn secondary full" href="/login">Voltar</a></div></div></div>`, '', null, '', g), 429);
  }
  const p = await bodyParams(request);
  const email = String(p.get('email') || '').trim().toLowerCase();
  const u = await dbGet(env.DB, 'SELECT * FROM users WHERE lower(email)=?', email);
  if (!u || u.is_active !== 1 || !(await verifyPassword(String(p.get('password') || ''), u.password_hash))) {
    await recordLoginFailure(env, ip);
    const g = await gym(env);
    return htmlResponse(layout('Login', `<div class="login-wrap simple"><div class="login-panel"><div class="login-card"><div class="alert danger-box">E-mail ou senha inválidos.</div><a class="btn secondary full" href="/login">Voltar</a></div></div></div>`, '', null, '', g), 401);
  }
  await clearLoginFailures(env, ip);
  await dbRun(env.DB, 'DELETE FROM sessions WHERE expires_at<=?', new Date().toISOString());
  const token = await createSession(u.id, env);
  return redirect(u.must_change_password ? '/conta/primeiro-acesso' : '/', { 'Set-Cookie': sessionCookie(token, request) });
});
route('GET', '/logout', async () => redirect('/'));
route('POST', '/logout', async (request, env) => {
  await deleteCurrentSession(request, env);
  return redirect('/login', { 'Set-Cookie': clearSessionCookie(request) });
});

// Nova conta: exige a troca da senha temporária no primeiro login.
route('GET', '/conta/primeiro-acesso', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  if (!user.must_change_password) return redirect('/');
  const g = await gym(env);
  const form = `<div class="panel" style="max-width:530px;margin:auto"><h2>Defina sua senha pessoal</h2><p>A senha provisória deve ser trocada antes de usar o sistema.</p><form method="post" action="/conta/primeiro-acesso" class="form"><label>Senha provisória<input type="password" name="current_password" required autocomplete="current-password"></label><label>Nova senha (mínimo 12 caracteres)<input type="password" name="password" minlength="12" required autocomplete="new-password"></label><label>Repita a nova senha<input type="password" name="confirm_password" minlength="12" required autocomplete="new-password"></label><button class="btn primary">Salvar minha senha</button></form></div>`;
  return htmlResponse(layout('Primeiro acesso', form, 'security', user, '', g));
});
route('POST', '/conta/primeiro-acesso', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  if (!user.must_change_password) return redirect('/');
  const p = await bodyParams(request);
  const u = await dbGet(env.DB, 'SELECT password_hash FROM users WHERE id=?', user.id);
  const password = String(p.get('password') || '');
  if (!(await verifyPassword(String(p.get('current_password') || ''), u.password_hash)) || password.length < 12 || password.length > 128 || password !== p.get('confirm_password') || password === String(p.get('current_password') || '')) {
    return htmlResponse('Não foi possível alterar a senha. Confira a senha provisória e escolha pelo menos 12 caracteres.', 400);
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').bind(await hashPassword(password), user.id),
    auditStatement(env, user, 'senha_primeiro_acesso', 'usuario', user.id, 'Senha provisória substituída (hash não registrado).'),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
  ]);
  return redirect('/login?ok=' + encodeURIComponent('Senha alterada. Entre novamente.'), { 'Set-Cookie': clearSessionCookie(request) });
});

// DASHBOARD
route('GET', '/', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  await ensureCurrentInvoices(env);
  const g = await gym(env), ref = currentReference(), t = today();
  const active = Number((await dbGet(env.DB, "SELECT COUNT(*) c FROM students WHERE status='active'"))?.c || 0);
  const paid = await dbGet(env.DB, "SELECT COALESCE(SUM(amount),0) total, COUNT(*) c FROM invoices WHERE status='paid' AND substr(paid_at,1,7)=?", ref) || { total: 0, c: 0 };
  const invoices = await dbAll(env.DB, "SELECT i.*,s.name,s.phone FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.reference_month=? AND i.status!='cancelled' ORDER BY i.due_date,s.name", ref);
  const overdue = await dbAll(env.DB, "SELECT i.*,s.name,s.phone FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.status='open' AND i.due_date<? ORDER BY i.due_date,s.name", t);
  const due3 = invoices.filter(i => invoiceStatus(i).startsWith('Vence em') || invoiceStatus(i) === 'Vence hoje');
  const overdueStudents = new Set(overdue.map(i => i.student_id));
  const goodStanding = Math.max(0, active - overdueStudents.size);
  const paidToday = Number((await dbGet(env.DB, "SELECT COUNT(*) c FROM invoices WHERE status='paid' AND substr(paid_at,1,10)=?", t))?.c || 0);
  const leads = Number((await dbGet(env.DB, "SELECT COUNT(*) c FROM leads WHERE status NOT IN ('Matriculou','Não interessado')"))?.c || 0);
  const recent = await dbAll(env.DB, "SELECT i.*,s.name FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.status='paid' ORDER BY i.paid_at DESC LIMIT 6");
  const birthdayRows = await dbAll(env.DB, "SELECT id,name,phone,birth_date,photo_data FROM students WHERE status='active' AND birth_date IS NOT NULL ORDER BY name");
  const birthdays = birthdayRows.filter(s => birthdayToday(s.birth_date));
  const attention = [...overdue, ...due3].slice(0, 7);
  const openValue = Number((await dbGet(env.DB, "SELECT COALESCE(SUM(amount),0) total FROM invoices WHERE status='open'"))?.total || 0);
  const content = `<div class="welcome-card"><div><span class="eyebrow">VISÃO GERAL · ONLINE</span><h2>Olá! Aqui está o resumo da ${htmlEscape(g.gym_name)}.</h2><p>${htmlEscape(referenceLabel(ref))} · acompanhe o que entrou, o que vence e quem precisa de atenção.</p></div><a class="btn primary" href="/alunos/novo">+ Cadastrar aluno</a></div>
  <div class="quick-status"><a class="status-button green" href="/alunos?status=good"><span>✓</span><div><strong>${goodStanding}</strong><small>Alunos em dia</small></div></a><a class="status-button red" href="/mensalidades?status=overdue"><span>!</span><div><strong>${overdue.length}</strong><small>Mensalidades atrasadas</small></div></a><a class="status-button yellow" href="/mensalidades?status=soon"><span>⌛</span><div><strong>${due3.length}</strong><small>Vencendo em até 3 dias</small></div></a></div>
  <div class="kpis"><div class="kpi"><span class="kpi-icon">👥</span><div><small>Alunos ativos</small><strong>${active}</strong><em>matriculados</em></div></div><div class="kpi"><span class="kpi-icon">R$</span><div><small>Recebido no mês</small><strong>${money(paid.total)}</strong><em>${paid.c} pagamentos</em></div></div><div class="kpi"><span class="kpi-icon">↗</span><div><small>A receber</small><strong>${money(openValue)}</strong><em>${invoices.filter(i => i.status === 'open').length} cobranças no período</em></div></div><div class="kpi"><span class="kpi-icon">✓</span><div><small>Pagamentos hoje</small><strong>${paidToday}</strong><em>registrados</em></div></div><div class="kpi"><span class="kpi-icon">🎯</span><div><small>Leads ativos</small><strong>${leads}</strong><em>futuros clientes</em></div></div><div class="kpi"><span class="kpi-icon">🎂</span><div><small>Aniversários hoje</small><strong>${birthdays.length}</strong><em>alunos</em></div></div></div>
  <div class="panel birthday-panel"><div class="panel-head"><div><h2>🎉 Aniversariantes do dia</h2><p>Uma mensagem pronta com um clique.</p></div><a href="/alunos?status=birthday">Ver aniversariantes</a></div>${birthdays.length ? `<div class="birthday-grid">${birthdays.map(s => `<div class="birthday-card"><div class="person">${s.photo_data ? `<div class="person-avatar image"><img src="${attr(s.photo_data)}" alt=""></div>` : `<div class="person-avatar">🎂</div>`}<div><strong>${htmlEscape(s.name)}</strong><small>${brDate(s.birth_date)}</small></div></div><a class="btn whatsapp small" target="_blank" rel="noopener" href="${whatsappLink(s.phone, `🎉 Feliz aniversário, ${s.name}! A ${g.gym_name} deseja muita saúde, conquistas e muitos treinos pela frente. Parabéns! 🥳💪`)}">WhatsApp</a></div>`).join('')}</div>` : '<div class="empty">Nenhum aniversariante hoje.</div>'}</div>
  <div class="grid-2"><div class="panel"><div class="panel-head"><div><h2>Precisa de atenção</h2><p>Cobranças prioritárias</p></div><a href="/mensalidades">Ver tudo</a></div><div class="list">${attention.map(i => `<div class="list-row"><div><strong>${htmlEscape(i.name)}</strong><small>${money(i.amount)} · ${brDate(i.due_date)}</small></div><div class="row-actions">${badge(invoiceStatus(i))}<a class="btn ghost small" target="_blank" rel="noopener" href="${whatsappLink(i.phone, `Olá, ${i.name}! Tudo bem? Passando para lembrar da sua mensalidade da ${g.gym_name}, no valor de ${money(i.amount)}, com vencimento em ${brDate(i.due_date)}. 💪`)}">WhatsApp</a></div></div>`).join('') || '<div class="empty">Tudo em dia por aqui. 🎉</div>'}</div></div><div class="panel"><div class="panel-head"><div><h2>Pagamentos recentes</h2><p>Últimos recebimentos</p></div><a href="/relatorios">Relatórios</a></div><div class="list">${recent.map(i => `<div class="list-row"><div><strong>${htmlEscape(i.name)}</strong><small>${htmlEscape(i.payment_method || '—')} · ${brDate(i.paid_at)}</small></div><strong>${money(i.amount)}</strong></div>`).join('') || '<div class="empty">Nenhum pagamento registrado ainda.</div>'}</div></div></div>`;
  return htmlResponse(layout('Dashboard', content, 'dashboard', user, '', g));
});

// ALUNOS
route('GET', '/alunos', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  await ensureCurrentInvoices(env);
  const g = await gym(env), url = new URL(request.url), q = (url.searchParams.get('q') || '').trim(), f = url.searchParams.get('status') || 'all';
  let rows = await dbAll(env.DB, `SELECT s.*,p.name plan_name,i.status invoice_raw,i.due_date,
    (SELECT COUNT(*) FROM invoices oi WHERE oi.student_id=s.id AND oi.status='open' AND oi.due_date<?) overdue_count
    FROM students s LEFT JOIN plans p ON p.id=s.plan_id LEFT JOIN invoices i ON i.student_id=s.id AND i.reference_month=? AND i.status!='cancelled' ORDER BY s.name`, today(), currentReference());
  if (q) { const qq = q.toLocaleLowerCase('pt-BR'); rows = rows.filter(s => [s.name, s.phone, s.cep, s.street, s.neighborhood, s.city, s.address].filter(Boolean).some(v => String(v).toLocaleLowerCase('pt-BR').includes(qq))); }
  if (f === 'active') rows = rows.filter(s => s.status === 'active');
  if (f === 'inactive') rows = rows.filter(s => s.status === 'inactive');
  if (f === 'archived') rows = rows.filter(s => s.status === 'archived');
  if (f === 'all') rows = rows.filter(s => s.status !== 'archived');
  if (f === 'birthday') rows = rows.filter(s => birthdayToday(s.birth_date));
  if (f === 'good') rows = rows.filter(s => s.status === 'active' && Number(s.overdue_count) === 0);
  const totalStudents = Number((await dbGet(env.DB, "SELECT COUNT(*) c FROM students WHERE status!='archived'"))?.c || 0);
  const content = `${flashFrom(url)}<div class="toolbar"><form class="search" action="/alunos"><span>⌕</span><input name="q" placeholder="Buscar nome, telefone, CEP, rua ou cidade" value="${attr(q)}"><button>Buscar</button></form><a class="btn primary" href="/alunos/novo">+ Cadastrar aluno</a></div><div class="filters"><a class="${f === 'all' ? 'selected' : ''}" href="/alunos">Todos <b>${totalStudents}</b></a><a class="${f === 'active' ? 'selected' : ''}" href="/alunos?status=active">Ativos</a><a class="${f === 'good' ? 'selected' : ''}" href="/alunos?status=good">🟢 Sem atraso</a><a class="${f === 'inactive' ? 'selected' : ''}" href="/alunos?status=inactive">Inativos</a><a class="${f === 'archived' ? 'selected' : ''}" href="/alunos?status=archived">Arquivados</a><a class="${f === 'birthday' ? 'selected' : ''}" href="/alunos?status=birthday">🎂 Aniversariantes</a></div><div class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Plano</th><th>Mensalidade</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead><tbody>${rows.map(s => `<tr><td><div class="person">${s.photo_data ? `<div class="person-avatar image"><img src="${attr(s.photo_data)}" alt=""></div>` : `<div class="person-avatar">${htmlEscape(initials(s.name))}</div>`}<div><strong>${htmlEscape(s.name)}</strong><small>${htmlEscape(s.phone)}${studentAddress(s) ? ` · ${htmlEscape([s.neighborhood, s.city].filter(Boolean).join(', ') || studentAddress(s))}` : ''}</small></div></div></td><td>${htmlEscape(s.plan_name || '—')}</td><td>${money(s.monthly_value)}</td><td>Dia ${s.due_day}</td><td>${badge(s.status === 'archived' ? 'Arquivado' : s.status !== 'active' ? 'Inativo' : Number(s.overdue_count) > 0 ? 'Vencido' : (s.invoice_raw ? invoiceStatus({ status: s.invoice_raw, due_date: s.due_date }) : 'Em dia'))}</td><td><a class="table-link" href="/alunos/${s.id}">Abrir ficha →</a></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum aluno encontrado.</td></tr>'}</tbody></table></div></div>`;
  return htmlResponse(layout('Alunos', content, 'students', user, '', g));
});
// V4.2 — busca autenticada de possíveis cadastros duplicados, somente leitura.
route('GET', '/api/alunos/verificar-duplicidade', async (request, env) => {
  const user = await currentUser(request, env);
  if (!user) return new Response(JSON.stringify({ error: 'Faça login novamente.' }), {
    status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
  const url = new URL(request.url);
  const phone = String(url.searchParams.get('phone') || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const name = String(url.searchParams.get('name') || '').trim().slice(0, 160)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const excludeId = Number(url.searchParams.get('exclude_id') || 0);
  const matches = [];
  if (phone.length >= 10 || name.length >= 5) {
    const candidates = await dbAll(env.DB, 'SELECT id,name,phone,status FROM students ORDER BY id DESC LIMIT 2000');
    for (const item of candidates) {
      if (Number(item.id) === excludeId) continue;
      const candidatePhone = String(item.phone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
      const candidateName = String(item.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/\s+/g, ' ');
      const samePhone = phone.length >= 10 && candidatePhone === phone;
      const sameName = name.length >= 5 && candidateName === name;
      if (samePhone || sameName) {
        matches.push({ id: item.id, name: item.name, phone: item.phone, status: item.status,
          reason: samePhone && sameName ? 'Mesmo telefone e nome' : samePhone ? 'Mesmo telefone' : 'Mesmo nome' });
      }
      if (matches.length >= 5) break;
    }
  }
  return new Response(JSON.stringify({ matches }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
});
route('GET', '/alunos/novo', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const plans = await dbAll(env.DB, 'SELECT * FROM plans WHERE active=1 ORDER BY months,name'), g = await gym(env);
  return htmlResponse(layout('Cadastrar aluno', studentForm({}, plans), 'students', user, '', g));
});
route('POST', '/alunos', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request);
  const street = p.get('street') || '', number = p.get('number') || '', complement = p.get('complement') || '', neighborhood = p.get('neighborhood') || '', city = p.get('city') || '', state = (p.get('state') || '').toUpperCase();
  const address = [street, number, complement, neighborhood, city, state].filter(Boolean).join(', ');
  const id = await dbInsertId(env.DB, `INSERT INTO students (name,phone,birth_date,address,cep,street,number,complement,neighborhood,city,state,start_date,plan_id,monthly_value,due_day,status,notes,photo_data,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    String(p.get('name') || '').trim(), String(p.get('phone') || '').trim(), p.get('birth_date') || null, address, p.get('cep') || '', street, number, complement, neighborhood, city, state, p.get('start_date'), Number(p.get('plan_id')), Number(p.get('monthly_value')), Number(p.get('due_day')), p.get('status') || 'active', p.get('notes') || '', p.get('photo_data') || '', nowLocal());
  await dbRun(env.DB, 'INSERT INTO audit_log (user_id,actor_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?)', user.id, user.name, 'aluno_criado', 'aluno', id, 'Novo cadastro realizado');
  await ensureCurrentInvoices(env);
  return redirect(`/alunos/${id}?ok=${encodeURIComponent('Aluno cadastrado com sucesso')}`);
});
route('GET', /^\/alunos\/(?<id>\d+)\/editar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const s = await dbGet(env.DB, 'SELECT * FROM students WHERE id=?', Number(params.id)), g = await gym(env);
  if (!s) return htmlResponse(layout('Aluno não encontrado', '<div class="empty">Aluno não encontrado.</div>', 'students', user, '', g), 404);
  if (s.status === 'archived') return redirect(`/alunos/${s.id}`);
  const plans = await dbAll(env.DB, 'SELECT * FROM plans ORDER BY active DESC,months,name');
  return htmlResponse(layout(`Editar ${s.name}`, studentForm(s, plans, `/alunos/${s.id}/editar`, `Editar ${s.name}`), 'students', user, '', g));
});
route('POST', /^\/alunos\/(?<id>\d+)\/editar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const id = Number(params.id), p = await bodyParams(request), old = await dbGet(env.DB, 'SELECT * FROM students WHERE id=?', id);
  if (!old) return htmlResponse('Aluno não encontrado', 404);
  if (old.status === 'archived') return htmlResponse('Reative o aluno antes de editar o cadastro.', 409);
  const street = p.get('street') || '', number = p.get('number') || '', complement = p.get('complement') || '', neighborhood = p.get('neighborhood') || '', city = p.get('city') || '', state = (p.get('state') || '').toUpperCase();
  const address = [street, number, complement, neighborhood, city, state].filter(Boolean).join(', ');
  const inv = await dbGet(env.DB, 'SELECT * FROM invoices WHERE student_id=? AND reference_month=?', id, currentReference());
  const statements = [
    env.DB.prepare(`UPDATE students SET name=?,phone=?,birth_date=?,address=?,cep=?,street=?,number=?,complement=?,neighborhood=?,city=?,state=?,start_date=?,plan_id=?,monthly_value=?,due_day=?,status=?,notes=?,photo_data=?,updated_at=? WHERE id=?`)
      .bind(String(p.get('name') || '').trim(), String(p.get('phone') || '').trim(), p.get('birth_date') || null, address, p.get('cep') || '', street, number, complement, neighborhood, city, state, p.get('start_date'), Number(p.get('plan_id')), Number(p.get('monthly_value')), Number(p.get('due_day')), p.get('status') || 'active', p.get('notes') || '', p.get('photo_data') || '', nowLocal(), id),
    auditStatement(env, user, 'aluno_editado', 'aluno', id, 'Dados do cadastro e plano alterados',
      { plan_id: old.plan_id, monthly_value: old.monthly_value, due_day: old.due_day, status: old.status },
      { plan_id: Number(p.get('plan_id')), monthly_value: Number(p.get('monthly_value')), due_day: Number(p.get('due_day')), status: p.get('status') || 'active' })
  ];
  if (inv && inv.status === 'open') {
    const newAmount = Number(p.get('monthly_value')), newDue = dueDateFor(Number(p.get('due_day')));
    statements.push(
      env.DB.prepare(`INSERT INTO audit_log(user_id,actor_name,action,entity_type,entity_id,description,old_data,new_data)
        SELECT ?,?,'cobranca_ajustada','mensalidade',id,'Valor ou vencimento em aberto ajustado',json_object('amount',amount,'due_date',due_date),?
        FROM invoices WHERE id=? AND status='open' AND (amount!=? OR due_date!=?)`)
        .bind(user.id,user.name,JSON.stringify({amount:newAmount,due_date:newDue}),inv.id,newAmount,newDue),
      env.DB.prepare("UPDATE invoices SET amount=?,due_date=? WHERE id=? AND status='open'").bind(newAmount,newDue,inv.id)
    );
  }
  await env.DB.batch(statements);
  await ensureCurrentInvoices(env);
  return redirect(`/alunos/${id}?ok=${encodeURIComponent('Cadastro atualizado')}`);
});
// Endereço antigo de exclusão passa a ARQUIVAR para nunca apagar pagamentos por engano.
async function archiveStudent(request, env, params) {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const id = Number(params.id);
  const current = await dbGet(env.DB, 'SELECT id,name,status FROM students WHERE id=?', id);
  if (!current) return htmlResponse('Aluno não encontrado', 404);
  if (current.status === 'archived') return redirect('/alunos?status=archived');
  const p = await bodyParams(request);
  const reason = String(p.get('reason') || '').trim().slice(0, 160);
  const changedAt = nowLocal();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_log (user_id,actor_name,action,entity_type,entity_id,description,old_data,new_data)
      SELECT ?,?,'aluno_arquivado','aluno',id,?,json_object('status',status),? FROM students WHERE id=? AND status!='archived'`)
      .bind(user.id,user.name,reason || 'Cadastro arquivado; histórico preservado',JSON.stringify({status:'archived'}),id),
    env.DB.prepare("UPDATE students SET status='archived',archived_at=?,archive_reason=?,updated_at=? WHERE id=? AND status!='archived'")
      .bind(changedAt, reason, changedAt, id)
  ]);
  return redirect(`/alunos/${id}?ok=${encodeURIComponent('Aluno arquivado; pagamentos e recibos preservados')}`);
}
route('POST', /^\/alunos\/(?<id>\d+)\/arquivar$/, archiveStudent);
route('POST', /^\/alunos\/(?<id>\d+)\/excluir$/, archiveStudent);
route('POST', /^\/alunos\/(?<id>\d+)\/reativar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const id = Number(params.id), old = await dbGet(env.DB, 'SELECT status FROM students WHERE id=?',id);
  if (!old) return htmlResponse('Aluno não encontrado', 404);
  if (old.status !== 'archived') return redirect(`/alunos/${id}`);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_log(user_id,actor_name,action,entity_type,entity_id,description,old_data,new_data)
      SELECT ?,?,'aluno_reativado','aluno',id,'Matrícula reativada; histórico anterior mantido',json_object('status',status),? FROM students WHERE id=? AND status='archived'`)
      .bind(user.id,user.name,JSON.stringify({status:'active'}),id),
    env.DB.prepare("UPDATE students SET status='active',archived_at=NULL,archive_reason=NULL,updated_at=? WHERE id=? AND status='archived'").bind(nowLocal(),id)
  ]);
  await ensureCurrentInvoices(env);
  return redirect(`/alunos/${id}?ok=${encodeURIComponent('Aluno reativado')}`);
});
route('POST', /^\/alunos\/(?<id>\d+)\/treino$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request), sid = Number(params.id), tid = Number(p.get('template_id'));
  const student = await dbGet(env.DB, "SELECT id,status FROM students WHERE id=?", sid);
  if (!student || student.status !== 'active' || !(await dbGet(env.DB, 'SELECT id FROM workout_templates WHERE id=?', tid))) return htmlResponse('Aluno ou treino inválido', 400);
  await env.DB.batch([
    env.DB.prepare('UPDATE student_workouts SET active=0 WHERE student_id=? AND active=1').bind(sid),
    env.DB.prepare('INSERT INTO student_workouts(student_id,template_id,assigned_at,notes,active) VALUES (?,?,?,?,1)').bind(sid, tid, today(), String(p.get('notes') || '').trim().slice(0,500)),
    auditStatement(env,user,'treino_atribuido','aluno',sid,'Novo treino atribuído pelo professor',null,{template_id:tid})
  ]);
  return redirect(`/alunos/${sid}?ok=${encodeURIComponent('Treino vinculado ao aluno')}`);
});
route('GET', /^\/alunos\/(?<id>\d+)$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  await ensureCurrentInvoices(env);
  const url = new URL(request.url), id = Number(params.id), g = await gym(env);
  const s = await dbGet(env.DB, 'SELECT s.*,p.name plan_name FROM students s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.id=?', id);
  if (!s) return htmlResponse(layout('Aluno não encontrado', '<div class="empty">Aluno não encontrado.</div>', 'students', user, '', g), 404);
  const invs = await dbAll(env.DB, 'SELECT * FROM invoices WHERE student_id=? ORDER BY due_date DESC LIMIT 18', id);
  const current = invs.find(i => i.reference_month === currentReference() && i.status !== 'cancelled');
  const overdueOpen = await dbGet(env.DB, "SELECT * FROM invoices WHERE student_id=? AND status='open' AND due_date<? ORDER BY due_date LIMIT 1", id, today());
  const focusInvoice = overdueOpen || current;
  const assigned = await dbGet(env.DB, 'SELECT sw.*,t.name template_name,t.level,t.audience FROM student_workouts sw JOIN workout_templates t ON t.id=sw.template_id WHERE sw.student_id=? AND sw.active=1 ORDER BY sw.id DESC LIMIT 1', id);
  const templates = await dbAll(env.DB, 'SELECT id,name,level FROM workout_templates ORDER BY name');
  const progress = await loadStudentProgress(env,id,assigned);
  const bday = birthdayToday(s.birth_date);
  const photo = s.photo_data ? `<div class="person-avatar big image"><img src="${attr(s.photo_data)}" alt=""></div>` : `<div class="person-avatar big">${htmlEscape(initials(s.name))}</div>`;
  const content = `${flashFrom(url)}<div class="student-hero"><div class="student-main">${photo}<div><span class="eyebrow">FICHA DO ALUNO</span><h2>${htmlEscape(s.name)} ${bday ? '🎂' : ''}</h2><p>${htmlEscape(s.phone)} · ${htmlEscape(s.plan_name || 'Sem plano')}</p><div class="chips">${badge(s.status === 'archived' ? 'Arquivado' : s.status === 'active' ? 'Ativo' : 'Inativo')}${focusInvoice ? badge(invoiceStatus(focusInvoice)) : ''}</div></div></div><div class="hero-actions">${s.status !== 'archived' ? `<a class="btn secondary" href="/alunos/${id}/editar">Editar cadastro</a>` : ''}${bday ? `<a class="btn whatsapp" target="_blank" rel="noopener" href="${whatsappLink(s.phone, `🎉 Feliz aniversário, ${s.name}! A ${g.gym_name} deseja muita saúde, conquistas e muitos treinos pela frente. Parabéns! 🥳💪`)}">🎂 Parabenizar</a>` : ''}<a class="btn whatsapp" target="_blank" rel="noopener" href="${whatsappLink(s.phone, `Olá, ${s.name}! Aqui é da ${g.gym_name}. 💪`)}">WhatsApp</a></div></div>
  <div class="grid-2"><div class="panel"><div class="panel-head"><h2>Dados do aluno</h2></div><dl class="details"><div><dt>Início</dt><dd>${brDate(s.start_date)}</dd></div><div><dt>Nascimento</dt><dd>${brDate(s.birth_date)}</dd></div><div><dt>CEP</dt><dd>${htmlEscape(s.cep || '—')}</dd></div><div><dt>Cidade</dt><dd>${htmlEscape([s.city, s.state].filter(Boolean).join(' / ') || '—')}</dd></div><div class="full"><dt>Endereço</dt><dd>${htmlEscape(studentAddress(s) || '—')}</dd></div><div><dt>Mensalidade</dt><dd>${money(s.monthly_value)}</dd></div><div><dt>Vencimento</dt><dd>Dia ${s.due_day}</dd></div><div class="full"><dt>Observações</dt><dd>${htmlEscape(s.notes || '—')}</dd></div></dl></div><div class="panel"><div class="panel-head"><h2>${overdueOpen ? 'Cobrança pendente' : 'Mensalidade atual'}</h2></div>${focusInvoice ? `<div class="invoice-highlight"><div>${badge(invoiceStatus(focusInvoice))}<h3>${money(focusInvoice.amount)}</h3><p>Vencimento em ${brDate(focusInvoice.due_date)} · referência ${htmlEscape(focusInvoice.reference_month)}</p></div>${focusInvoice.status !== 'paid' ? `<form method="post" action="/mensalidades/${focusInvoice.id}/pagar"><label>Forma de pagamento<select name="payment_method"><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Transferência</option></select></label><button class="btn primary">Marcar como pago</button></form>` : `<div class="paid-box"><small>Pago em ${brDate(focusInvoice.paid_at)}</small><strong>${htmlEscape(focusInvoice.receipt_number || '—')}</strong><a class="btn secondary small" href="/recibos/${focusInvoice.id}">Ver recibo</a></div>`}</div>` : '<div class="empty">Sem cobrança neste período.</div>'}</div></div>
  <div class="grid-2"><div class="panel"><div class="panel-head"><div><h2>Treino atual</h2><p>Modelo vinculado a este aluno</p></div>${assigned ? `<a href="/treinos/${assigned.template_id}">Abrir treino</a>` : ''}</div>${assigned ? `<div class="assigned-workout"><span class="workout-icon">🏋️</span><div><strong>${htmlEscape(assigned.template_name)}</strong><small>${htmlEscape(assigned.level || '')} · atribuído em ${brDate(assigned.assigned_at)}</small></div><a class="btn secondary small" href="/alunos/${id}/previa">Prévia do aluno</a><a class="btn whatsapp small" target="_blank" rel="noopener" href="/treinos/enviar?template_id=${assigned.template_id}&student_id=${id}">Enviar</a></div>` : '<div class="empty">Nenhum treino vinculado ainda.</div>'}<p class="portal-admin-help"><a href="/alunos/${id}/acesso">🔐 Gerenciar acesso ao aplicativo do aluno</a></p><form method="post" action="/alunos/${id}/treino" class="inline-form assign-form"><select name="template_id" required><option value="">Selecionar modelo de treino</option>${templates.map(t => `<option value="${t.id}">${htmlEscape(t.name)} · ${htmlEscape(t.level || '')}</option>`).join('')}</select><button class="btn secondary">Vincular treino</button></form></div><div class="panel danger-zone"><div class="panel-head"><div><h2>Administração</h2><p>Ações do cadastro</p></div></div><p>${s.status === 'archived' ? 'Aluno arquivado. Todos os pagamentos, recibos e treinos anteriores continuam salvos.' : 'Se o aluno sair da academia, arquive em vez de excluir. Todos os pagamentos e recibos serão preservados.'}</p><div class="row-actions left">${s.status === 'archived' ? `<form method="post" action="/alunos/${id}/reativar" data-confirm="Reativar ${attr(s.name)}? Uma cobrança do período atual pode ser gerada caso ainda não exista."><button class="btn primary">Reativar aluno</button></form>` : `<a class="btn secondary" href="/alunos/${id}/editar">Editar aluno</a><form method="post" action="/alunos/${id}/arquivar" data-confirm="Arquivar ${attr(s.name)}? O histórico financeiro será preservado."><button class="btn danger">Arquivar aluno</button></form>`}</div></div></div>
  ${progressOverview(id,progress)}
  <div class="panel"><div class="panel-head"><div><h2>Histórico financeiro</h2><p>Mensalidades mais recentes</p></div></div><div class="table-wrap"><table><thead><tr><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Pagamento</th><th>Recibo</th></tr></thead><tbody>${invs.map(i => `<tr><td>${htmlEscape(i.reference_month)}</td><td>${brDate(i.due_date)}</td><td>${money(i.amount)}</td><td>${badge(invoiceStatus(i))}</td><td>${i.paid_at ? `${brDate(i.paid_at)} · ${htmlEscape(i.payment_method || '')}` : '—'}</td><td>${i.status === 'paid' ? `<a class="table-link" href="/recibos/${i.id}">${htmlEscape(i.receipt_number || 'Abrir')}</a>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sem histórico.</td></tr>'}</tbody></table></div></div>`;
  return htmlResponse(layout(s.name, content, 'students', user, '', g));
});


route('GET', /^\/alunos\/(?<id>\d+)\/acompanhamento$/, async (request,env,params) => {
  const user=await currentUser(request,env); if (!user) return redirect('/login');
  const id=Number(params.id),student=await dbGet(env.DB,'SELECT id,name,status FROM students WHERE id=?',id);
  const g=await gym(env);
  if (!student) return htmlResponse(layout('Aluno não encontrado','<div class="empty">Aluno não encontrado.</div>','students',user,'',g),404);
  const assigned=await dbGet(env.DB,`SELECT sw.id,sw.template_id,t.name template_name FROM student_workouts sw
    JOIN workout_templates t ON t.id=sw.template_id WHERE sw.student_id=? AND sw.active=1 ORDER BY sw.id DESC LIMIT 1`,id);
  const p=await loadStudentProgress(env,id,assigned);
  const blocks=p.blocks.map(b=>`<section class="st-progress-block"><div class="st-progress-block-head"><div><h3>${htmlEscape(b.label)}</h3><small>${b.done}/${b.total} concluídos · ${percent(b.done,b.total)}%</small></div><span class="badge ${b.done===b.total&&b.total>0?'success':'neutral'}">${b.done===b.total&&b.total>0?'Bloco completo':'Em andamento'}</span></div>${progressTrack(b.done,b.total)}<div class="st-progress-rows">${b.exercises.map(e=>`<div class="st-progress-exercise"><span class="${e.done?'st-done-icon':'st-open-icon'}">${e.done?'✓':'○'}</span><span>${htmlEscape(e.exercise)}</span><strong>${e.done?'Concluído':'Pendente'}</strong></div>`).join('')}</div></section>`).join('');
  const content=`<div class="st-progress-page"><div class="st-progress-page-header"><div><span class="eyebrow">PAINEL DO PROFESSOR · V1.3</span><h2>${htmlEscape(student.name)}</h2><p>Progresso informado pelo aluno; atualize esta página após novas marcações.</p></div><a class="btn secondary" href="/alunos/${id}">← Voltar ao cadastro</a></div>
    <div class="st-progress-kpis"><div><small>Ficha ativa</small><strong>${htmlEscape(assigned?.template_name||'Sem ficha')}</strong></div><div><small>Hoje · ${brDate(today())}</small><strong>${p.done}/${p.total} · ${percent(p.done,p.total)}%</strong></div><div><small>Última atividade</small><strong>${brDate(p.lastDay)}</strong></div></div>
    <div class="panel"><div class="panel-head"><div><h2>Exercícios de hoje</h2><p>Somente a ficha ativa. Marcação de todos os itens de um bloco indica bloco completo.</p></div><a href="/alunos/${id}/previa">Ver prévia da ficha</a></div>${progressTrack(p.done,p.total)}<div class="st-progress-blocks">${blocks||'<div class="empty">Atribua uma ficha para começar o acompanhamento.</div>'}</div></div>
    <div class="panel"><div class="panel-head"><div><h2>Histórico de atividades</h2><p>Até 90 registros recentes de dias e blocos. O histórico representa marcações, não presença física.</p></div></div>${historyTable(p.history)}</div></div>`;
  return htmlResponse(layout(`Progresso · ${student.name}`,content,'students',user,'',g));
});

// MENSALIDADES E RECIBOS
route('GET', '/mensalidades', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  await ensureCurrentInvoices(env);
  const g = await gym(env), url = new URL(request.url);
  const selected = url.searchParams.get('mes') || currentReference();
  const month = /^20\d\d-(0[1-9]|1[0-2])$/.test(selected) ? selected : currentReference();
  const requestedFilter = url.searchParams.get('status') || 'paid';
  const filter = ['paid','all','overdue','today','soon'].includes(requestedFilter) ? requestedFilter : 'paid';
  const monthHref = (status, ref = month) => `/mensalidades?mes=${encodeURIComponent(ref)}&status=${encodeURIComponent(status)}`;
  let rows;
  if (filter === 'paid') rows = await dbAll(env.DB, "SELECT i.*,s.name,s.phone FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.status='paid' AND substr(i.paid_at,1,7)=? ORDER BY i.paid_at,s.name", month);
  else {
    rows = await dbAll(env.DB, "SELECT i.*,s.name,s.phone FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.reference_month=? AND i.status='open' ORDER BY i.due_date,s.name", month);
    if (filter !== 'all') {
      rows = rows.filter(i => filter === 'overdue' ? invoiceStatus(i) === 'Vencido' : filter === 'soon' ? (invoiceStatus(i).startsWith('Vence em') || invoiceStatus(i) === 'Vence hoje') : invoiceStatus(i) === 'Vence hoje');
    }
  }
  const total = rows.reduce((a, b) => a + Number(b.amount), 0);
  const paidView = filter === 'paid';
  const label = paidView ? 'Total recebido no mês' : 'Total de cobranças nesta lista';
  const entries = rows.map(i => `<tr><td><a class="person-link" href="/alunos/${i.student_id}"><strong>${htmlEscape(i.name)}</strong><small>${htmlEscape(i.phone)}</small></a></td><td>${brDate(paidView ? i.paid_at : i.due_date)}</td>${paidView ? `<td>${htmlEscape(referenceLabel(i.reference_month))}</td>` : ''}<td>${money(i.amount)}</td><td>${paidView ? `<a class="btn secondary small" href="/recibos/${i.id}">🧾 Recibo / corrigir</a>` : `<div class="billing-actions"><form class="inline-pay" method="post" action="/mensalidades/${i.id}/pagar"><select name="payment_method"><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Transferência</option></select><button class="btn primary small">Receber</button></form><details class="billing-cancel"><summary>Anular lançamento indevido</summary><form method="post" action="/mensalidades/${i.id}/anular-teste" data-confirm="Anular esta cobrança de ${attr(i.name)} (${attr(i.reference_month)})? Ela deixará de contar nos valores a receber."><input name="reason" aria-label="Motivo da anulação" required minlength="4" maxlength="200" placeholder="Motivo da anulação"><button type="submit" class="btn danger small">Confirmar anulação</button></form></details></div>`}</td></tr>`).join('') || `<tr><td colspan="${paidView ? 5 : 4}" class="empty">${paidView ? 'Nenhum pagamento registrado neste mês.' : 'Nenhuma cobrança neste filtro.'}</td></tr>`;
  const content = `${flashFrom(url)}<section class="panel billing-month"><div><span class="eyebrow">CONTROLE MENSAL</span><h2>${htmlEscape(referenceLabel(month))}</h2><p>${paidView ? 'Pagamentos agrupados pela data em que foram recebidos.' : 'Cobranças referentes ao mês escolhido.'}</p></div><div class="billing-month-controls"><a class="btn secondary small" href="${monthHref(filter,monthAdd(month,-1))}" aria-label="Mês anterior">←</a><form method="get" action="/mensalidades"><input type="hidden" name="status" value="${attr(filter)}"><label>Escolher mês<input type="month" name="mes" value="${attr(month)}" required></label><button class="btn secondary small">Ver</button></form><a class="btn secondary small" href="${monthHref(filter,monthAdd(month,1))}" aria-label="Próximo mês">→</a></div></section><div class="quick-status compact"><a class="status-button green ${paidView ? 'selected' : ''}" href="${monthHref('paid')}"><span>✓</span><div><strong>Pagos no mês</strong><small>Pagamentos registrados</small></div></a><a class="status-button red ${filter === 'overdue' ? 'selected' : ''}" href="${monthHref('overdue')}"><span>!</span><div><strong>Vencidas</strong><small>Cobranças deste mês</small></div></a><a class="status-button yellow ${filter === 'soon' ? 'selected' : ''}" href="${monthHref('soon')}"><span>⌛</span><div><strong>Vencendo</strong><small>Hoje ou próximos 3 dias</small></div></a></div><div class="filters"><a class="${paidView ? 'selected' : ''}" href="${monthHref('paid')}">Pagaram</a><a class="${filter === 'all' ? 'selected' : ''}" href="${monthHref('all')}">A receber</a><a class="${filter === 'overdue' ? 'selected' : ''}" href="${monthHref('overdue')}">Vencidas</a><a class="${filter === 'today' ? 'selected' : ''}" href="${monthHref('today')}">Hoje</a><a class="${filter === 'soon' ? 'selected' : ''}" href="${monthHref('soon')}">Próximos 3 dias</a></div><div class="panel table-panel"><div class="table-summary"><div><small>${rows.length} ${paidView ? 'pagamento(s)' : 'cobrança(s)'}</small><strong>${money(total)}</strong></div><span>${label} · ${htmlEscape(referenceLabel(month))}</span></div><div class="table-wrap"><table><thead><tr><th>Aluno</th><th>${paidView ? 'Data do pagamento' : 'Vencimento'}</th>${paidView ? '<th>Mensalidade de referência</th>' : ''}<th>Valor</th><th>${paidView ? 'Recibo' : 'Ação'}</th></tr></thead><tbody>${entries}</tbody><tfoot><tr><th colspan="${paidView ? 3 : 2}">${label}</th><th>${money(total)}</th><th></th></tr></tfoot></table></div></div>`;
  return htmlResponse(layout('Mensalidades', content, 'invoices', user, '<a class="btn secondary" href="/relatorios">Ver relatórios</a>', g));
});
route('POST', /^\/mensalidades\/(?<id>\d+)\/pagar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request), id = Number(params.id), inv = await dbGet(env.DB, 'SELECT * FROM invoices WHERE id=?', id);
  if (!inv) return htmlResponse('Não encontrado', 404);
  if (inv.status === 'paid') return redirect(`/recibos/${id}?ok=${encodeURIComponent('Este pagamento já estava confirmado; não foi registrado novamente')}`);
  if (inv.status !== 'open') return htmlResponse('Cobrança anulada: não é possível registrar pagamento.', 409);
  const methods = ['Pix','Dinheiro','Cartão de débito','Cartão de crédito','Transferência'];
  const method = methods.includes(p.get('payment_method')) ? p.get('payment_method') : 'Pix';
  const receipt = inv.receipt_number || `ST-${today().slice(0, 4)}-${String(id).padStart(6, '0')}`;
  const paidAt = nowLocal();
  // D1 batch = transação: auditoria só é escrita quando a cobrança estava em aberto.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_log (user_id,actor_name,action,entity_type,entity_id,description,old_data,new_data)
      SELECT ?,?,'pagamento_confirmado','mensalidade',id,'Pagamento registrado',json_object('status',status,'amount',amount,'due_date',due_date,'paid_at',paid_at),?
      FROM invoices WHERE id=? AND status='open'`).bind(user.id,user.name,JSON.stringify({status:'paid',amount:inv.amount,paid_at:paidAt,payment_method:method,receipt_number:receipt}),id),
    env.DB.prepare("UPDATE invoices SET status='paid',paid_at=?,payment_method=?,receipt_number=? WHERE id=? AND status='open'").bind(paidAt,method,receipt,id)
  ]);
  const updated = Number(results[1]?.meta?.changes || 0) > 0;
  return redirect(`/recibos/${id}?ok=${encodeURIComponent(updated ? 'Pagamento registrado e recibo gerado' : 'Pagamento já estava confirmado')}`);
});
route('POST', /^\/mensalidades\/(?<id>\d+)\/desfazer-pagamento$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const id = Number(params.id), p = await bodyParams(request), reason = String(p.get('reason') || '').trim();
  if (reason.length < 4 || reason.length > 200) return htmlResponse('Informe um motivo entre 4 e 200 caracteres.', 400);
  const invoice = await dbGet(env.DB, 'SELECT status,reference_month FROM invoices WHERE id=?', id);
  if (!invoice) return htmlResponse('Mensalidade não encontrada.', 404);
  if (invoice.status !== 'paid') return redirect(`/mensalidades?ok=${encodeURIComponent('Esta mensalidade já não consta como paga')}`);
  // Mantém a cobrança e o registro do recibo anterior no histórico de auditoria.
  // A transação reabre somente a mensalidade selecionada.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_log (user_id,actor_name,action,entity_type,entity_id,description,old_data,new_data)
      SELECT ?,?,'pagamento_desfeito','mensalidade',id,?,
        json_object('status',status,'amount',amount,'due_date',due_date,'paid_at',paid_at,'payment_method',payment_method,'receipt_number',receipt_number),
        json_object('status','open','motivo',?)
      FROM invoices WHERE id=? AND status='paid'`).bind(user.id,user.name,`Pagamento desfeito: ${reason}`,reason,id),
    env.DB.prepare("UPDATE invoices SET status='open',paid_at=NULL,payment_method=NULL,receipt_number=NULL WHERE id=? AND status='paid'").bind(id)
  ]);
  const updated = Number(results[1]?.meta?.changes || 0) > 0;
  return redirect(`/mensalidades?mes=${encodeURIComponent(invoice.reference_month)}&status=all&ok=${encodeURIComponent(updated ? 'Pagamento desfeito; mensalidade em aberto' : 'Esta mensalidade já não consta como paga')}`);
});
route('POST', /^\/mensalidades\/(?<id>\d+)\/anular-teste$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const id = Number(params.id), p = await bodyParams(request), reason = String(p.get('reason') || '').trim();
  if (reason.length < 4 || reason.length > 200) return htmlResponse('Informe um motivo entre 4 e 200 caracteres.', 400);
  const invoice = await dbGet(env.DB, 'SELECT status,reference_month,paid_at FROM invoices WHERE id=?', id);
  if (!invoice) return htmlResponse('Mensalidade não encontrada.', 404);
  if (invoice.status === 'cancelled') return redirect(`/mensalidades?ok=${encodeURIComponent('Esta cobrança já foi anulada')}`);
  if (!['paid','open'].includes(invoice.status)) return htmlResponse('Esta cobrança não pode ser anulada.', 409);
  // Mantém o lançamento e o recibo anterior na auditoria, sem afetar outros alunos.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_log (user_id,actor_name,action,entity_type,entity_id,description,old_data,new_data)
      SELECT ?,?,'cobranca_anulada','mensalidade',id,?,
        json_object('status',status,'amount',amount,'due_date',due_date,'paid_at',paid_at,'payment_method',payment_method,'receipt_number',receipt_number),
        json_object('status','cancelled','motivo',?)
      FROM invoices WHERE id=? AND status IN ('paid','open')`).bind(user.id,user.name,`Cobrança anulada: ${reason}`,reason,id),
    env.DB.prepare("UPDATE invoices SET status='cancelled',paid_at=NULL,payment_method=NULL,receipt_number=NULL WHERE id=? AND status IN ('paid','open')").bind(id)
  ]);
  const updated = Number(results[1]?.meta?.changes || 0) > 0;
  const month = invoice.status === 'paid' ? String(invoice.paid_at || '').slice(0,7) : invoice.reference_month;
  return redirect(`/mensalidades?mes=${encodeURIComponent(month)}&status=${invoice.status === 'paid' ? 'paid' : 'all'}&ok=${encodeURIComponent(updated ? 'Cobrança anulada; saiu dos pagamentos e dos valores a receber' : 'Esta cobrança já foi anulada')}`);
});
route('GET', /^\/recibos\/(?<id>\d+)$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const url = new URL(request.url), g = await gym(env);
  const inv = await dbGet(env.DB, 'SELECT i.*,s.name,s.phone,p.name plan_name FROM invoices i JOIN students s ON s.id=i.student_id LEFT JOIN plans p ON p.id=s.plan_id WHERE i.id=?', Number(params.id));
  if (!inv || inv.status !== 'paid') return htmlResponse(layout('Recibo não encontrado', '<div class="empty">O pagamento ainda não possui recibo.</div>', 'invoices', user, '', g), 404);
  const logo = g.logo_data ? `<img src="${attr(g.logo_data)}" class="receipt-logo" alt="">` : `<div class="receipt-logo-text">${htmlEscape(initials(g.gym_name))}</div>`;
  const correction = `<details class="invoice-correction no-print"><summary>Corrigir pagamento lançado por engano</summary><p>Se a mensalidade continua válida, desfaça apenas o pagamento: a cobrança fica em aberto. Se o lançamento inteiro foi feito por engano, anule a cobrança: ela sai dos pagamentos e dos valores a receber.</p><form method="post" action="/mensalidades/${inv.id}/desfazer-pagamento" data-confirm="Desfazer o pagamento de ${attr(inv.name)} (${attr(inv.reference_month)})? O recibo deixará de estar disponível e a mensalidade voltará a ficar em aberto."><label>Motivo da correção<input name="reason" minlength="4" maxlength="200" required placeholder="Ex.: pagamento lançado por engano"></label><button class="btn secondary small" type="submit">Desfazer só o pagamento</button></form><form method="post" action="/mensalidades/${inv.id}/anular-teste" data-confirm="ANULAR o lançamento de ${attr(inv.name)} (${attr(inv.reference_month)})? Confira nome, mês e valor. Ele deixará de ser contado como pago ou pendente."><label>Motivo da anulação<input name="reason" minlength="4" maxlength="200" required placeholder="Ex.: cobrança lançada por engano"></label><button class="btn danger small" type="submit">Anular lançamento indevido</button></form></details>`;
  const content = `${flashFrom(url)}<div class="receipt-actions no-print"><a class="btn secondary" href="/alunos/${inv.student_id}">← Voltar ao aluno</a><div><a class="btn whatsapp" target="_blank" rel="noopener" href="${whatsappLink(inv.phone, receiptMessage(inv, { name: inv.name }, g))}">📲 Enviar dados pelo WhatsApp</a><button class="btn primary" type="button" onclick="window.print()">🧾 Imprimir / Salvar PDF</button></div></div>${correction}<article class="receipt"><div class="receipt-head">${logo}<div><h2>${htmlEscape(g.gym_name)}</h2><p>${htmlEscape(g.slogan || '')}</p></div><div class="receipt-number"><small>RECIBO</small><strong>${htmlEscape(inv.receipt_number)}</strong></div></div><div class="receipt-title"><span>Pagamento confirmado</span><h1>${money(inv.amount)}</h1><p>Recebemos de <strong>${htmlEscape(inv.name)}</strong> o valor acima referente ao plano <strong>${htmlEscape(inv.plan_name || 'Academia')}</strong>.</p></div><div class="receipt-grid"><div><small>Aluno</small><strong>${htmlEscape(inv.name)}</strong></div><div><small>Referência</small><strong>${htmlEscape(inv.reference_month)}</strong></div><div><small>Data do pagamento</small><strong>${brDate(inv.paid_at)}</strong></div><div><small>Forma de pagamento</small><strong>${htmlEscape(inv.payment_method || '—')}</strong></div><div><small>Vencimento original</small><strong>${brDate(inv.due_date)}</strong></div><div><small>Número do recibo</small><strong>${htmlEscape(inv.receipt_number)}</strong></div></div><div class="receipt-footer"><div>${g.cnpj ? `<p>CNPJ: ${htmlEscape(g.cnpj)}</p>` : ''}${gymAddress(g) ? `<p>${htmlEscape(gymAddress(g))}</p>` : ''}${g.phone ? `<p>${htmlEscape(g.phone)}${g.email ? ` · ${htmlEscape(g.email)}` : ''}</p>` : ''}</div><strong>${htmlEscape(g.receipt_footer || 'Obrigado pela confiança!')}</strong></div></article>`;
  return htmlResponse(layout('Recibo de pagamento', content, 'invoices', user, '', g));
});

// FUTUROS CLIENTES / LEADS
route('GET', '/leads', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const url = new URL(request.url), leads = await dbAll(env.DB, 'SELECT * FROM leads ORDER BY created_at DESC'), g = await gym(env);
  const content = `${flashFrom(url)}<div class="toolbar"><div><p class="page-intro">Acompanhe cada interessado desde o primeiro contato até a matrícula.</p></div><a class="btn primary" href="/leads/novo">+ Novo futuro cliente</a></div><div class="lead-board six">${leadStatuses.map(st => `<div class="lead-column"><div class="lead-column-head"><strong>${st}</strong><span>${leads.filter(l => l.status === st).length}</span></div>${leads.filter(l => l.status === st).map(l => `<div class="lead-card"><div class="lead-card-head"><strong>${htmlEscape(l.name)}</strong><a href="/leads/${l.id}/editar">Editar</a></div><small>${htmlEscape(l.phone)} · ${brDate(l.contact_date)}</small><p>${htmlEscape(l.goal || l.interest || 'Sem detalhes')}</p><div class="lead-actions"><a target="_blank" rel="noopener" href="${whatsappLink(l.phone, `Olá, ${l.name}! Aqui é da ${g.gym_name}. Você ainda está pensando em começar seus treinos? 💪 Quer que eu te passe nossos planos?`)}">WhatsApp →</a>${l.status !== 'Matriculou' ? `<a href="/leads/${l.id}/matricular">Matricular →</a>` : ''}</div></div>`).join('') || '<div class="empty mini">Sem contatos</div>'}</div>`).join('')}</div>`;
  return htmlResponse(layout('Futuros clientes', content, 'leads', user, '', g));
});
route('GET', '/leads/novo', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const g = await gym(env); return htmlResponse(layout('Novo futuro cliente', leadForm(), 'leads', user, '', g));
});
route('POST', '/leads', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request);
  await dbRun(env.DB, 'INSERT INTO leads (name,phone,contact_date,goal,interest,notes,status,updated_at) VALUES (?,?,?,?,?,?,?,?)', p.get('name'), p.get('phone'), p.get('contact_date'), p.get('goal') || '', p.get('interest') || '', p.get('notes') || '', p.get('status') || 'Novo', nowLocal());
  return redirect(`/leads?ok=${encodeURIComponent('Futuro cliente cadastrado')}`);
});
route('GET', /^\/leads\/(?<id>\d+)\/editar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const l = await dbGet(env.DB, 'SELECT * FROM leads WHERE id=?', Number(params.id)); if (!l) return redirect('/leads');
  const g = await gym(env); return htmlResponse(layout('Editar futuro cliente', leadForm(l, `/leads/${l.id}/editar`, `Editar ${l.name}`), 'leads', user, '', g));
});
route('POST', /^\/leads\/(?<id>\d+)\/editar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request);
  await dbRun(env.DB, 'UPDATE leads SET name=?,phone=?,contact_date=?,goal=?,interest=?,notes=?,status=?,updated_at=? WHERE id=?', p.get('name'), p.get('phone'), p.get('contact_date'), p.get('goal') || '', p.get('interest') || '', p.get('notes') || '', p.get('status') || 'Novo', nowLocal(), Number(params.id));
  return redirect(`/leads?ok=${encodeURIComponent('Contato atualizado')}`);
});
route('POST', /^\/leads\/(?<id>\d+)\/excluir$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  await dbRun(env.DB, 'DELETE FROM leads WHERE id=?', Number(params.id)); return redirect(`/leads?ok=${encodeURIComponent('Contato excluído')}`);
});
route('GET', /^\/leads\/(?<id>\d+)\/matricular$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const l = await dbGet(env.DB, 'SELECT * FROM leads WHERE id=?', Number(params.id)); if (!l) return redirect('/leads');
  const plans = await dbAll(env.DB, 'SELECT * FROM plans WHERE active=1 ORDER BY months,name'), g = await gym(env);
  const draft = { name: l.name, phone: l.phone, start_date: today(), notes: [l.goal && `Objetivo: ${l.goal}`, l.notes].filter(Boolean).join('\n') };
  return htmlResponse(layout('Matricular futuro cliente', studentForm(draft, plans, `/leads/${l.id}/matricular`, 'Matricular futuro cliente'), 'leads', user, '', g));
});
route('POST', /^\/leads\/(?<id>\d+)\/matricular$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request), leadId = Number(params.id);
  const street = p.get('street') || '', number = p.get('number') || '', complement = p.get('complement') || '', neighborhood = p.get('neighborhood') || '', city = p.get('city') || '', state = (p.get('state') || '').toUpperCase(), address = [street, number, complement, neighborhood, city, state].filter(Boolean).join(', ');
  const id = await dbInsertId(env.DB, `INSERT INTO students (name,phone,birth_date,address,cep,street,number,complement,neighborhood,city,state,start_date,plan_id,monthly_value,due_day,status,notes,photo_data,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, p.get('name'), p.get('phone'), p.get('birth_date') || null, address, p.get('cep') || '', street, number, complement, neighborhood, city, state, p.get('start_date'), Number(p.get('plan_id')), Number(p.get('monthly_value')), Number(p.get('due_day')), p.get('status') || 'active', p.get('notes') || '', p.get('photo_data') || '', nowLocal());
  await dbRun(env.DB, "UPDATE leads SET status='Matriculou',updated_at=? WHERE id=?", nowLocal(), leadId);
  await ensureCurrentInvoices(env);
  return redirect(`/alunos/${id}?ok=${encodeURIComponent('Lead convertido em aluno')}`);
});

// CENTRAL DE WHATSAPP
route('GET', '/whatsapp', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  await ensureCurrentInvoices(env);
  const g = await gym(env);
  const invs = await dbAll(env.DB, "SELECT i.*,s.name,s.phone FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.status='open' ORDER BY i.due_date");
  const urgent = invs.filter(i => ['Vencido', 'Vence hoje'].includes(invoiceStatus(i)) || invoiceStatus(i).startsWith('Vence em'));
  const birthdayRows = await dbAll(env.DB, "SELECT id,name,phone,birth_date FROM students WHERE status='active' AND birth_date IS NOT NULL ORDER BY name"), birthdays = birthdayRows.filter(s => birthdayToday(s.birth_date));
  const assigned = await dbAll(env.DB, "SELECT s.id,s.name,s.phone,t.id template_id,t.name template_name FROM student_workouts sw JOIN students s ON s.id=sw.student_id JOIN workout_templates t ON t.id=sw.template_id WHERE sw.active=1 AND s.status='active' ORDER BY s.name LIMIT 30");
  const content = `<div class="whatsapp-hero"><div><span class="eyebrow">CENTRAL DE MENSAGENS</span><h2>WhatsApp como canal principal</h2><p>As mensagens já saem personalizadas; você só revisa e envia.</p></div><div class="whatsapp-orb">◉</div></div><div class="grid-2"><div class="panel"><div class="panel-head"><div><h2>Cobranças e lembretes</h2><p>Vencidas, hoje e próximos 3 dias.</p></div><span class="badge neutral">${urgent.length}</span></div><div class="list">${urgent.map(i => { const st = invoiceStatus(i); const msg = st === 'Vencido' ? `Olá, ${i.name}! Tudo bem? Identificamos que sua mensalidade da ${g.gym_name}, no valor de ${money(i.amount)}, venceu em ${brDate(i.due_date)}. Se já realizou o pagamento, desconsidere esta mensagem. 💪` : `Olá, ${i.name}! Tudo bem? Passando para lembrar que sua mensalidade da ${g.gym_name} vence em ${brDate(i.due_date)}. 💰 Valor: ${money(i.amount)}. Contamos com você! 💪`; return `<div class="list-row"><div><strong>${htmlEscape(i.name)}</strong><small>${money(i.amount)} · ${brDate(i.due_date)}</small></div><div class="row-actions">${badge(st)}<a class="btn whatsapp small" target="_blank" rel="noopener" href="${whatsappLink(i.phone, msg)}">Abrir</a></div></div>` }).join('') || '<div class="empty">Nenhuma cobrança urgente.</div>'}</div></div><div class="panel"><div class="panel-head"><div><h2>🎂 Aniversários de hoje</h2><p>Não deixe nenhum aluno passar em branco.</p></div><span class="badge neutral">${birthdays.length}</span></div><div class="list">${birthdays.map(s => `<div class="list-row"><div><strong>${htmlEscape(s.name)}</strong><small>${brDate(s.birth_date)}</small></div><a class="btn whatsapp small" target="_blank" rel="noopener" href="${whatsappLink(s.phone, `🎉 Feliz aniversário, ${s.name}! A ${g.gym_name} deseja muita saúde, conquistas e muitos treinos pela frente. Parabéns! 🥳💪`)}">Parabenizar</a></div>`).join('') || '<div class="empty">Nenhum aniversariante hoje.</div>'}</div></div></div><div class="panel"><div class="panel-head"><div><h2>Treinos vinculados</h2><p>Envie rapidamente o treino atual de cada aluno.</p></div><a href="/treinos">Gerenciar treinos</a></div><div class="list">${assigned.map(a => `<div class="list-row"><div><strong>${htmlEscape(a.name)}</strong><small>${htmlEscape(a.template_name)}</small></div><a class="btn whatsapp small" target="_blank" rel="noopener" href="/treinos/enviar?template_id=${a.template_id}&student_id=${a.id}">Enviar treino</a></div>`).join('') || '<div class="empty">Nenhum treino vinculado.</div>'}</div></div>`;
  return htmlResponse(layout('WhatsApp', content, 'whatsapp', user, '', g));
});

// TREINOS
route('GET', '/treinos', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const g = await gym(env), url = new URL(request.url);
  const templates = await dbAll(env.DB, `SELECT t.*,COUNT(i.id) item_count,(SELECT COUNT(*) FROM student_workouts sw WHERE sw.template_id=t.id AND sw.active=1) assigned_count FROM workout_templates t LEFT JOIN workout_template_items i ON i.template_id=t.id GROUP BY t.id ORDER BY t.is_system DESC,CASE t.level WHEN 'Iniciante' THEN 1 WHEN 'Intermediário' THEN 2 WHEN 'Avançado' THEN 3 ELSE 4 END,t.name`);
  const content = `${flashFrom(url)}<div class="toolbar"><div><p class="page-intro">Use os modelos prontos ou crie treinos personalizados para sua academia.</p></div><a class="btn primary" href="/treinos/novo">+ Criar treino</a></div><div class="workout-grid">${templates.map(t => `<a class="workout-card" href="/treinos/${t.id}"><div class="workout-icon">${t.is_system ? '★' : '🏋️'}</div><div><div class="chips"><span class="badge neutral">${htmlEscape(t.level || '')}</span>${t.is_system ? '<span class="badge system">Modelo Super Treino</span>' : ''}</div><h3>${htmlEscape(t.name)}</h3><p>${htmlEscape(t.notes || '')}</p><small>${t.item_count} exercícios · ${t.assigned_count} aluno(s) usando</small></div><strong>→</strong></a>`).join('')}</div><div class="panel note"><strong>Uso responsável</strong><p>Os modelos são uma base administrativa. Carga, execução, amplitude, limitações e progressão devem ser individualizadas pelo profissional responsável.</p></div>`;
  return htmlResponse(layout('Treinos', content, 'workouts', user, '', g));
});
route('GET', '/treinos/novo', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  if (!await workoutNotesReady(env.DB)) return workoutMigrationNotice(user,await gym(env));
  const g = await gym(env); return htmlResponse(layout('Criar treino', workoutForm(), 'workouts', user, '', g));
});
async function workoutNotesReady(db) {
  const columns = await dbAll(db, 'PRAGMA table_info(workout_template_items)');
  return ['exercise_notes','suggested_load'].every(name=>columns.some(column=>column.name === name));
}
function workoutMigrationNotice(user,g) {
  const content = `<div class="panel"><h2>Atualização local pendente</h2><p>Para usar os recados, cargas sugeridas e séries, pare o servidor e aplique as migrações no banco local desta mesma pasta.</p><p><code>npm run migrate:local</code></p><p>Faça antes uma cópia da pasta inteira, incluindo .wrangler. Se o comando mostrar erro, envie uma foto da janela do CMD. Não use db:local nem comandos remotos.</p></div>`;
  return htmlResponse(layout('Atualização local pendente',content,'workouts',user,'',g),503);
}
async function saveWorkoutItems(db, templateId, params, existing = []) {
  const savedIds = new Set(existing.map(row => Number(row.id)));
  const kept = new Set(), statements = [];
  const ids = params.getAll('item_id'), labels = params.getAll('workout_label');
  const exercises = params.getAll('exercise'), sets = params.getAll('sets');
  const reps = params.getAll('reps'), rests = params.getAll('rest');
  const notes = params.getAll('exercise_notes'), loads = params.getAll('suggested_load');
  exercises.forEach((raw, i) => {
    const name = String(raw).trim(); if (!name) return;
    const fields = [labels[i] || 'Treino A', name, sets[i] || '3', reps[i] || '10', rests[i] || '', String(notes[i] || '').trim().slice(0,500), String(loads[i] || '').trim().slice(0,30), i];
    const rowId = Number(ids[i]);
    if (savedIds.has(rowId) && !kept.has(rowId)) {
      kept.add(rowId);
      statements.push(db.prepare('UPDATE workout_template_items SET workout_label=?,exercise=?,sets=?,reps=?,rest=?,exercise_notes=?,suggested_load=?,sort_order=? WHERE id=? AND template_id=?').bind(...fields,rowId,templateId));
    } else {
      statements.push(db.prepare('INSERT INTO workout_template_items (workout_label,exercise,sets,reps,rest,exercise_notes,suggested_load,sort_order,template_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(...fields,templateId));
    }
  });
  for (const id of savedIds) if (!kept.has(id)) statements.push(db.prepare('DELETE FROM workout_template_items WHERE id=? AND template_id=?').bind(id,templateId));
  if (statements.length) await db.batch(statements);
}
route('POST', '/treinos', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  if (!await workoutNotesReady(env.DB)) return workoutMigrationNotice(user,await gym(env));
  const p = await bodyParams(request), g = await gym(env); let id;
  try { id = await dbInsertId(env.DB, 'INSERT INTO workout_templates (name,audience,level,notes,is_system,updated_at) VALUES (?,?,?,?,0,?)', p.get('name'), p.get('audience') || 'Todos', p.get('level') || 'Personalizado', p.get('notes') || '', nowLocal()); }
  catch { return htmlResponse(layout('Nome já utilizado', '<div class="panel"><h2>Já existe um treino com esse nome.</h2><a class="btn secondary" href="/treinos/novo">Voltar</a></div>', 'workouts', user, '', g), 400); }
  await saveWorkoutItems(env.DB,id,p);
  return redirect(`/treinos/${id}?ok=${encodeURIComponent('Treino criado')}`);
});
route('GET', /^\/treinos\/(?<id>\d+)\/editar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  if (!await workoutNotesReady(env.DB)) return workoutMigrationNotice(user,await gym(env));
  const t = await dbGet(env.DB, 'SELECT * FROM workout_templates WHERE id=?', Number(params.id)); if (!t) return redirect('/treinos');
  const items = await dbAll(env.DB, 'SELECT * FROM workout_template_items WHERE template_id=? ORDER BY sort_order,id', t.id), g = await gym(env);
  return htmlResponse(layout(`Editar ${t.name}`, workoutForm(t, items, `/treinos/${t.id}/editar`, `Editar ${t.name}`), 'workouts', user, '', g));
});
route('POST', /^\/treinos\/(?<id>\d+)\/editar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  if (!await workoutNotesReady(env.DB)) return workoutMigrationNotice(user,await gym(env));
  const p = await bodyParams(request), id = Number(params.id);
  try { await dbRun(env.DB, 'UPDATE workout_templates SET name=?,audience=?,level=?,notes=?,updated_at=? WHERE id=?', p.get('name'), p.get('audience') || 'Todos', p.get('level') || 'Personalizado', p.get('notes') || '', nowLocal(), id); }
  catch { return redirect(`/treinos/${id}/editar`); }
  const existing = await dbAll(env.DB, 'SELECT id FROM workout_template_items WHERE template_id=?', id);
  await saveWorkoutItems(env.DB,id,p,existing);
  return redirect(`/treinos/${id}?ok=${encodeURIComponent('Treino atualizado')}`);
});
route('POST', /^\/treinos\/(?<id>\d+)\/excluir$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  await dbRun(env.DB, 'DELETE FROM workout_templates WHERE id=?', Number(params.id));
  return redirect(`/treinos?ok=${encodeURIComponent('Treino excluído')}`);
});
route('GET', /^\/treinos\/(?<id>\d+)$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const url = new URL(request.url), t = await dbGet(env.DB, 'SELECT * FROM workout_templates WHERE id=?', Number(params.id)), g = await gym(env);
  if (!t) return htmlResponse(layout('Treino não encontrado', '<div class="empty">Treino não encontrado.</div>', 'workouts', user, '', g), 404);
  const items = await dbAll(env.DB, 'SELECT * FROM workout_template_items WHERE template_id=? ORDER BY sort_order,id', t.id);
  const students = await dbAll(env.DB, "SELECT id,name FROM students WHERE status='active' ORDER BY name");
  const assigned = await dbAll(env.DB, 'SELECT s.id,s.name FROM student_workouts sw JOIN students s ON s.id=sw.student_id WHERE sw.template_id=? AND sw.active=1 ORDER BY s.name', t.id);
  const labels = [...new Set(items.map(i => i.workout_label))];
  const sections = labels.map(label => `<div class="panel workout-section"><div class="panel-head"><h2>${htmlEscape(label)}</h2><span class="badge neutral">${items.filter(i => i.workout_label === label).length} exercícios</span></div><div class="table-wrap"><table><thead><tr><th>Exercício</th><th>Séries</th><th>Repetições</th><th>Descanso</th></tr></thead><tbody>${items.filter(i => i.workout_label === label).map(i => `<tr><td><strong>${htmlEscape(i.exercise)}</strong>${youtubeExecutionLink(i.exercise)}${i.exercise_notes?`<small class="workout-item-note">${htmlEscape(i.exercise_notes)}</small>`:''}</td><td>${htmlEscape(i.sets)}</td><td>${htmlEscape(i.reps)}</td><td>${htmlEscape(i.rest || '—')}</td></tr>`).join('')}</tbody></table></div></div>`).join('');
  const content = `${flashFrom(url)}<div class="student-hero workout-hero"><div><div class="chips"><span class="badge neutral">${htmlEscape(t.level || '')}</span><span class="badge neutral">${htmlEscape(t.audience || '')}</span>${t.is_system ? '<span class="badge system">Modelo Super Treino</span>' : ''}</div><h2>${htmlEscape(t.name)}</h2><p>${htmlEscape(t.notes || '')}</p></div><div class="hero-actions"><a class="btn secondary" href="/treinos/${t.id}/editar">Editar treino</a><form method="get" action="/treinos/enviar" class="send-workout"><input type="hidden" name="template_id" value="${t.id}"><select name="student_id" required><option value="">Enviar para...</option>${students.map(s => `<option value="${s.id}">${htmlEscape(s.name)}</option>`).join('')}</select><button class="btn whatsapp">📲 WhatsApp</button></form></div></div>${sections}<div class="panel portal-assign-panel"><div class="panel-head"><div><h2>📌 Atribuir esta ficha a um aluno</h2><p>Escolha um aluno ativo. Se ele já tiver uma ficha, ela irá para o histórico.</p></div></div><form method="post" action="/treinos/${t.id}/atribuir" class="portal-assign-form"><label>Aluno<select name="student_id" required><option value="">Selecione um aluno...</option>${students.map(s => `<option value="${s.id}">${htmlEscape(s.name)} · matrícula ${s.id}</option>`).join('')}</select></label><label>Orientações individuais (opcional)<input name="notes" maxlength="500" placeholder="Ex.: cuidado com o joelho direito"></label><button class="btn primary" type="submit">Atribuir ficha</button></form></div><div class="grid-2"><div class="panel"><div class="panel-head"><div><h2>Alunos usando este treino</h2><p>Vínculos ativos</p></div><span class="badge neutral">${assigned.length}</span></div><div class="list">${assigned.map(s => `<div class="list-row"><a href="/alunos/${s.id}"><strong>${htmlEscape(s.name)}</strong><small>Abrir ficha do aluno</small></a><a class="table-link" target="_blank" rel="noopener" href="/treinos/enviar?template_id=${t.id}&student_id=${s.id}">Enviar →</a></div>`).join('') || '<div class="empty">Ainda não vinculado a nenhum aluno.</div>'}</div></div><div class="panel danger-zone"><div class="panel-head"><h2>Administração do treino</h2></div><p>Editar altera o modelo para todos os alunos vinculados. Excluir remove o modelo e seus vínculos.</p><form method="post" action="/treinos/${t.id}/excluir" data-confirm="Excluir o treino ${attr(t.name)}?"><button class="btn danger">Excluir treino</button></form></div></div>`;
  return htmlResponse(layout(t.name, content, 'workouts', user, '', g));
});
route('GET', '/treinos/enviar', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const u = new URL(request.url), tid = Number(u.searchParams.get('template_id')), sid = Number(u.searchParams.get('student_id'));
  const t = await dbGet(env.DB, 'SELECT * FROM workout_templates WHERE id=?', tid), s = await dbGet(env.DB, 'SELECT * FROM students WHERE id=?', sid), g = await gym(env);
  if (!t || !s) return redirect('/treinos');
  const items = await dbAll(env.DB, 'SELECT * FROM workout_template_items WHERE template_id=? ORDER BY sort_order,id', tid);
  return redirect(whatsappLink(s.phone, `Olá, ${s.name}! 💪\n\n${templateMessage(t, items, g.gym_name)}`));
});


// V1.2 — atribuição direta a partir da página da ficha.
route('POST', /^\/treinos\/(?<id>\d+)\/atribuir$/, async (request,env,params) => {
  const user = await currentUser(request,env); if (!user) return redirect('/login');
  const id = Number(params.id), p = await bodyParams(request), studentId = Number(p.get('student_id'));
  const template = await dbGet(env.DB,'SELECT id,name FROM workout_templates WHERE id=?',id);
  const student = await dbGet(env.DB,"SELECT id,name,status FROM students WHERE id=?",studentId);
  if (!template || !student || student.status !== 'active') return htmlResponse('Aluno ou treino inválido.',400);
  await env.DB.batch([
    env.DB.prepare('UPDATE student_workouts SET active=0 WHERE student_id=? AND active=1').bind(studentId),
    env.DB.prepare('INSERT INTO student_workouts(student_id,template_id,assigned_at,notes,active) VALUES (?,?,?,?,1)').bind(studentId,id,today(),String(p.get('notes')||'').trim().slice(0,500)),
    auditStatement(env,user,'treino_atribuido','aluno',studentId,'Ficha atribuída no painel do professor',null,{template_id:id})
  ]);
  return redirect(`/alunos/${studentId}?ok=${encodeURIComponent('Ficha atribuída! Veja a prévia da área do aluno.')}`);
});
route('GET', /^\/alunos\/(?<id>\d+)\/previa$/, async (request,env,params) => {
  const user = await currentUser(request,env); if (!user) return redirect('/login');
  const id=Number(params.id), student=await dbGet(env.DB,'SELECT id,name FROM students WHERE id=?',id), g=await gym(env);
  if (!student) return htmlResponse('Aluno não encontrado',404);
  const assigned=await dbGet(env.DB,`SELECT sw.id,t.id template_id,t.name template_name,t.level,t.notes template_notes,sw.notes student_notes FROM student_workouts sw JOIN workout_templates t ON t.id=sw.template_id WHERE sw.student_id=? AND sw.active=1 ORDER BY sw.id DESC LIMIT 1`,id);
  const items=assigned ? await dbAll(env.DB,'SELECT * FROM workout_template_items WHERE template_id=? ORDER BY sort_order,id',assigned.template_id) : [];
  const body=`<div class="portal-preview-bar"><span>👁 Prévia administrativa — o aluno não verá os dados do painel</span><a href="/alunos/${id}">← Voltar ao cadastro</a></div>`+portalWorkoutContent({ ...student, csrf_token: '' },assigned,items,[],new URL(request.url).searchParams.get('bloco'),true);
  return htmlResponse(portalLayout(`Prévia de ${student.name}`,body,g));
});
route('GET', /^\/alunos\/(?<id>\d+)\/acesso$/, async (request,env,params) => {
  const user=await currentUser(request,env); if (!user) return redirect('/login');
  const id=Number(params.id),student=await dbGet(env.DB,'SELECT id,name,status FROM students WHERE id=?',id),g=await gym(env);
  if (!student) return htmlResponse('Aluno não encontrado',404);
  const account=await dbGet(env.DB,'SELECT enabled,created_at,updated_at FROM student_portal_accounts WHERE student_id=?',id);
  const content=`${flashFrom(new URL(request.url))}<div class="form-shell portal-admin-access"><div class="form-hero"><div><span class="eyebrow">ÁREA DO ALUNO</span><h2>${htmlEscape(student.name)}</h2><p>Matrícula nº ${id} · ${account ? account.enabled ? 'Acesso ativado' : 'Acesso revogado' : 'Sem acesso criado'}</p></div><div class="workout-badge">🔐</div></div><div class="panel"><h2>${account ? 'Redefinir acesso' : 'Criar acesso ao aplicativo'}</h2><p>O sistema gera uma senha provisória única, mostrada apenas uma vez. Entregue-a ao próprio aluno com seu número de matrícula; no primeiro login, ele terá de escolher uma nova senha.</p><form method="post" action="/alunos/${id}/acesso/gerar"><button class="btn primary">${account?'Gerar nova senha e encerrar sessões antigas':'Gerar acesso do aluno'}</button></form>${account?.enabled ? `<form method="post" action="/alunos/${id}/acesso/revogar" data-confirm="Revogar o acesso do aluno?" style="margin-top:12px"><button class="btn danger">Revogar acesso</button></form>` : ''}<div class="portal-access-links"><a href="/alunos/${id}/previa">Ver prévia da ficha</a><a href="/app/entrar" target="_blank" rel="noopener">Abrir login do aluno ↗</a><a href="/alunos/${id}">Voltar ao cadastro</a></div></div></div>`;
  return htmlResponse(layout('Acesso do aluno',content,'students',user,'',g));
});
route('POST', /^\/alunos\/(?<id>\d+)\/acesso\/gerar$/, async (request,env,params) => {
  const user=await currentUser(request,env); if (!user) return redirect('/login');
  const id=Number(params.id), student=await dbGet(env.DB,'SELECT id,name,status FROM students WHERE id=?',id),g=await gym(env);
  if (!student || student.status !== 'active') return htmlResponse('Somente alunos ativos podem acessar.',400);
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes=crypto.getRandomValues(new Uint8Array(18));
  const temp=[...bytes].map(n=>alphabet[n % alphabet.length]).join('');
  const hash=await hashPassword(temp);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO student_portal_accounts(student_id,password_hash,enabled,must_change_password,updated_at) VALUES(?,?,1,1,?) ON CONFLICT(student_id) DO UPDATE SET password_hash=excluded.password_hash,enabled=1,must_change_password=1,updated_at=excluded.updated_at`).bind(id,hash,nowLocal()),
    env.DB.prepare('DELETE FROM student_portal_sessions WHERE student_id=?').bind(id),
    auditStatement(env,user,'acesso_aluno_gerado','aluno',id,'Acesso ao aplicativo gerado ou redefinido')
  ]);
  const content=`<div class="panel portal-access-result"><span class="badge success">Acesso gerado</span><h2>${htmlEscape(student.name)}</h2><p>Copie agora os dados abaixo. A senha provisória não será mostrada novamente.</p><div class="portal-credential"><small>Matrícula</small><strong>${id}</strong></div><div class="portal-credential"><small>Senha provisória</small><strong class="portal-temp-password">${htmlEscape(temp)}</strong></div><p>Oriente o aluno a abrir <strong>/app/entrar</strong>, entrar com a matrícula e trocar a senha no primeiro acesso. Não envie senhas em grupos.</p><a class="btn primary" href="/alunos/${id}">Voltar ao aluno</a></div>`;
  return htmlResponse(layout('Acesso criado',content,'students',user,'',g));
});
route('POST', /^\/alunos\/(?<id>\d+)\/acesso\/revogar$/, async (request,env,params) => {
  const user=await currentUser(request,env); if (!user) return redirect('/login');
  const id=Number(params.id);
  await env.DB.batch([
    env.DB.prepare('UPDATE student_portal_accounts SET enabled=0,updated_at=? WHERE student_id=?').bind(nowLocal(),id),
    env.DB.prepare('DELETE FROM student_portal_sessions WHERE student_id=?').bind(id),
    auditStatement(env,user,'acesso_aluno_revogado','aluno',id,'Acesso ao aplicativo revogado')
  ]);
  return redirect(`/alunos/${id}/acesso?ok=${encodeURIComponent('Acesso revogado')}`);
});
route('GET','/app/entrar',async(request,env)=>{
  const existing=await currentStudent(request,env); if (existing) return redirect(existing.must_change_password?'/app/senha':'/app');
  const g=await gym(env),loginCsrf=randomToken(32),url=new URL(request.url);
  const content=`<div class="portal-login"><span class="eyebrow">SUPERTREINO APP</span><h1>Seu treino na palma da mão.</h1><p>Entre com sua matrícula e a senha fornecida pela academia.</p>${url.searchParams.get('erro')?'<p class="portal-error">Matrícula ou senha inválida. Confira os dados e tente novamente.</p>':''}<form method="post" action="/app/entrar" class="form"><input type="hidden" name="portal_login_csrf" value="${loginCsrf}"><label>Matrícula<input type="number" min="1" name="student_id" inputmode="numeric" autocomplete="username" required placeholder="Número da sua matrícula"></label><label>Senha<input type="password" name="password" required autocomplete="current-password" placeholder="Sua senha"></label><button class="btn primary full">Entrar no meu treino</button></form><small>Primeiro acesso? Peça sua senha provisória à recepção.</small></div>`;
  return htmlResponse(portalLayout('Entrar',content,g),200,{'Set-Cookie':portalLoginCsrfCookie(loginCsrf,request)});
});
route('POST','/app/entrar',async(request,env)=>{
  const p=await bodyParams(request),id=Number(p.get('student_id'));
  if (!Number.isSafeInteger(id) || id<=0) return redirect('/app/entrar?erro=1');
  const ip=`portal:${request.headers.get('CF-Connecting-IP') || 'local'}:${id}`;
  if (await loginBlocked(env,ip)) return htmlResponse('Muitas tentativas. Tente novamente em 15 minutos.',429);
  const acc=await dbGet(env.DB,"SELECT a.student_id,a.password_hash,a.must_change_password FROM student_portal_accounts a JOIN students s ON s.id=a.student_id WHERE a.student_id=? AND a.enabled=1 AND s.status='active'",id);
  if (!acc || !(await verifyPassword(String(p.get('password')||''),acc.password_hash))) {
    await recordLoginFailure(env,ip);return redirect('/app/entrar?erro=1');
  }
  await clearLoginFailures(env,ip);
  const token=randomToken(),hash=await sha256Hex(token),csrf=randomToken(24),expires=new Date(Date.now()+SESSION_HOURS*3600000).toISOString();
  await dbRun(env.DB,'INSERT INTO student_portal_sessions(token_hash,student_id,expires_at,csrf_token) VALUES(?,?,?,?)',hash,id,expires,csrf);
  return redirect(acc.must_change_password?'/app/senha':'/app',{'Set-Cookie':portalCookie(token,request)});
});
route('GET','/app/senha',async(request,env)=>{
  const student=await currentStudent(request,env); if (!student) return redirect('/app/entrar');
  const g=await gym(env),content=`<div class="portal-login"><span class="eyebrow">SEGURANÇA</span><h1>${student.must_change_password?'Crie sua senha pessoal':'Alterar senha'}</h1><p>${student.must_change_password?'Por segurança, você precisa substituir a senha provisória para abrir seus treinos.':'Escolha uma nova senha para acessar sua conta.'}</p><form method="post" action="/app/senha" class="form"><input type="hidden" name="csrf_token" value="${attr(student.csrf_token)}"><label>Senha atual<input name="old_password" type="password" required autocomplete="current-password"></label><label>Nova senha (mínimo 12 caracteres)<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>Repita a nova senha<input name="confirm_password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><button class="btn primary full">Salvar e abrir meu treino</button></form></div>`;
  return htmlResponse(portalLayout('Minha senha',content,g,student));
});
route('POST','/app/senha',async(request,env)=>{
  const student=await currentStudent(request,env); if (!student) return redirect('/app/entrar');
  const p=await bodyParams(request),password=String(p.get('password')||''),old=String(p.get('old_password')||'');
  if (!(await verifyPassword(old,student.password_hash))||password.length<12||password.length>128||password!==p.get('confirm_password')||password===old)
    return htmlResponse('Senha atual incorreta ou nova senha inválida. Volte, confira os campos e tente novamente.',400);
  const hash=await hashPassword(password);
  await dbRun(env.DB,'UPDATE student_portal_accounts SET password_hash=?,must_change_password=0,updated_at=? WHERE student_id=?',hash,nowLocal(),student.id);
  // Impede continuidade de sessões em outros aparelhos após a troca.
  const currentHash=await sha256Hex(parseCookies(request)[PORTAL_COOKIE]);
  await dbRun(env.DB,'DELETE FROM student_portal_sessions WHERE student_id=? AND token_hash!=?',student.id,currentHash);
  return redirect('/app');
});
route('POST','/app/sair',async(request,env)=>{
  const token=parseCookies(request)[PORTAL_COOKIE];
  if (token) await dbRun(env.DB,'DELETE FROM student_portal_sessions WHERE token_hash=?',await sha256Hex(token));
  return redirect('/app/entrar',{'Set-Cookie':portalClearCookie(request)});
});
route('GET','/app',async(request,env)=>{
  const student=await currentStudent(request,env); if (!student) return redirect('/app/entrar');
  if (student.must_change_password) return redirect('/app/senha');
  const assigned=await dbGet(env.DB,`SELECT sw.id,t.id template_id,t.name template_name,t.level,t.notes template_notes,sw.notes student_notes FROM student_workouts sw JOIN workout_templates t ON t.id=sw.template_id WHERE sw.student_id=? AND sw.active=1 ORDER BY sw.id DESC LIMIT 1`,student.id);
  const items=assigned?await dbAll(env.DB,'SELECT * FROM workout_template_items WHERE template_id=? ORDER BY sort_order,id',assigned.template_id):[];
  const checks=items.length?await dbAll(env.DB,`SELECT c.item_id FROM student_exercise_checks c JOIN workout_template_items i ON i.id=c.item_id WHERE c.student_id=? AND c.day=? AND i.template_id=?`,student.id,today(),assigned.template_id):[];
  const g=await gym(env);
  return htmlResponse(portalLayout('Meus treinos',portalWorkoutContent(student,assigned,items,checks,new URL(request.url).searchParams.get('bloco')),g,student));
});

// V1.8 — séries individuais e carga por dia, isoladas da cobrança e da ficha administrativa.
async function seriesReady(db) {
  const columns=await dbAll(db,'PRAGMA table_info(student_exercise_sets)');
  return columns.some(c=>c.name==='load_kg');
}
function seriesMigrationNotice(g,student) {
  return htmlResponse(portalLayout('Atualização pendente',`<div class="panel"><h1>Atualização local pendente</h1><p>O registro de séries precisa da nova migração. Peça ao responsável pelo sistema para executar <code>npm run migrate:local</code> na pasta desta versão.</p><a class="btn secondary" href="/app">Voltar aos treinos</a></div>`,g,student),503);
}
function prescribedSets(value) {
  const match=String(value||'').match(/^\s*(\d{1,2})/);
  return match?Math.max(1,Math.min(20,Number(match[1]))):3;
}
async function activeWorkoutItem(env,studentId,id) {
  return dbGet(env.DB,`SELECT i.*,t.name template_name,t.level,sw.id assignment_id
    FROM workout_template_items i JOIN student_workouts sw ON sw.template_id=i.template_id
    JOIN workout_templates t ON t.id=i.template_id
    WHERE i.id=? AND sw.student_id=? AND sw.active=1 ORDER BY sw.id DESC LIMIT 1`,id,studentId);
}
route('GET',/^\/app\/foco\/(?<id>\d+)$/,async(request,env,params)=>{
  const student=await currentStudent(request,env);if(!student)return redirect('/app/entrar');
  if(student.must_change_password)return redirect('/app/senha');
  const g=await gym(env);
  if(!await seriesReady(env.DB))return seriesMigrationNotice(g,student);
  const item=await activeWorkoutItem(env,student.id,Number(params.id));
  if(!item)return htmlResponse(portalLayout('Exercício indisponível','<div class="panel"><h2>Exercício indisponível</h2><a href="/app">Voltar aos treinos</a></div>',g,student),404);
  const all=await dbAll(env.DB,'SELECT id,exercise FROM workout_template_items WHERE template_id=? AND workout_label=? ORDER BY sort_order,id',item.template_id,item.workout_label);
  const pos=all.findIndex(i=>i.id===item.id),next=all[pos+1],previous=all[pos-1];
  const logged=await dbAll(env.DB,'SELECT set_number,load_kg FROM student_exercise_sets WHERE student_id=? AND item_id=? AND day=?',student.id,item.id,today());
  const entries=new Map(logged.map(s=>[s.set_number,s]));
  const last=await dbGet(env.DB,'SELECT load_kg,day FROM student_exercise_sets WHERE student_id=? AND item_id=? AND day<? AND load_kg IS NOT NULL ORDER BY day DESC,set_number DESC LIMIT 1',student.id,item.id,today());
  const restSeconds=String(item.rest||'').match(/\d+/)?.[0]||'60';
  const sets=prescribedSets(item.sets),done=await dbGet(env.DB,'SELECT id FROM student_exercise_checks WHERE student_id=? AND item_id=? AND day=?',student.id,item.id,today());
  const rows=Array.from({length:sets},(_,n)=>{const number=n+1,entry=entries.get(number);
    return `<form method="post" action="/app/foco/${item.id}/serie" class="focus-set ${entry?'is-done':''}"><input type="hidden" name="csrf_token" value="${attr(student.csrf_token)}"><input type="hidden" name="set_number" value="${number}"><span><b>Série ${number}</b><small>${entry?'Registrada hoje':'Pendente'}</small></span><label>Carga (kg)<input name="load_kg" type="number" min="0" max="1000" step="0.5" inputmode="decimal" value="${entry?.load_kg??''}" placeholder="Opcional"></label><button class="btn ${entry?'secondary':'primary'} small" name="action" value="save">${entry?'Atualizar':'✓ Concluir série'}</button>${entry?'<button class="btn secondary small" name="action" value="remove" aria-label="Desfazer série '+number+'">Desfazer</button>':''}</form>`;
  }).join('');
  const content=`<div class="focus-header"><a href="/app?bloco=${encodeURIComponent(item.workout_label)}">← Voltar à ficha</a><span>${htmlEscape(item.workout_label)} · Exercício ${pos+1} de ${all.length}</span></div><div class="portal-welcome focus-hero"><span class="eyebrow">MODO FOCO</span><h1>${htmlEscape(item.exercise)}</h1><p>Registre as séries feitas hoje. A carga é opcional.</p><div class="portal-summary"><span>SÉRIES <strong>${htmlEscape(item.sets)}</strong></span><span>REPETIÇÕES <strong>${htmlEscape(item.reps)}</strong></span><span>DESCANSO <strong>${htmlEscape(item.rest||'—')}</strong></span></div></div><div class="focus-layout"><section class="panel focus-primary">${exerciseDemoMarkup(item.exercise)}${youtubeExecutionLink(item.exercise)}${item.exercise_notes?`<div class="portal-exercise-note"><strong>Recado do professor</strong><p>${htmlEscape(item.exercise_notes)}</p></div>`:''}${item.suggested_load?`<p class="focus-advice">Carga sugerida: <strong>${htmlEscape(item.suggested_load)}</strong></p>`:''}${last?`<p class="focus-advice">Última carga registrada: <strong>${last.load_kg} kg</strong> em ${brDate(last.day)}</p>`:''}<div class="focus-timer" data-rest-seconds="${Math.min(Number(restSeconds),600)}"><button type="button" class="btn secondary" data-rest-start>⏱ Iniciar descanso</button><strong data-rest-clock aria-live="off">${htmlEscape(item.rest||'60s')}</strong><button type="button" class="btn secondary small" data-rest-reset>Reiniciar</button></div></section><section class="panel focus-sets"><h2>Séries de hoje · ${logged.length}/${sets}</h2>${rows}<form method="post" action="/app/exercicios/${item.id}/concluir" class="focus-complete"><input type="hidden" name="csrf_token" value="${attr(student.csrf_token)}"><input type="hidden" name="done" value="${done?'0':'1'}"><input type="hidden" name="bloco" value="${attr(item.workout_label)}"><button class="btn ${done?'secondary':'primary'}" type="submit">${done?'Desmarcar exercício':'✓ Marcar exercício como concluído'}</button></form></section></div><div class="focus-navigation">${previous?`<a class="btn secondary" href="/app/foco/${previous.id}">← Anterior</a>`:'<span></span>'}${next?`<a class="btn primary" href="/app/foco/${next.id}">Próximo exercício →</a>`:`<a class="btn primary" href="/app?bloco=${encodeURIComponent(item.workout_label)}">Ver ficha →</a>`}</div>`;
  return htmlResponse(portalLayout('Modo foco',content,g,student));
});
route('POST',/^\/app\/foco\/(?<id>\d+)\/serie$/,async(request,env,params)=>{
  const student=await currentStudent(request,env);if(!student)return redirect('/app/entrar');
  if(student.must_change_password)return redirect('/app/senha');
  if(!await seriesReady(env.DB))return seriesMigrationNotice(await gym(env),student);
  const item=await activeWorkoutItem(env,student.id,Number(params.id));
  if(!item)return htmlResponse('Exercício indisponível para este aluno.',403);
  const p=await bodyParams(request),number=Number(p.get('set_number'));
  if(!Number.isInteger(number)||number<1||number>prescribedSets(item.sets))return htmlResponse('Série inválida.',400);
  const raw=String(p.get('load_kg')||'').trim().replace(',','.');
  const weight=raw===''?null:Number(raw);
  if(p.get('action')!=='remove'&&(!/^\d{0,4}(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(weight??0)||weight>1000))return htmlResponse('Carga inválida.',400);
  if(p.get('action')==='remove')await dbRun(env.DB,'DELETE FROM student_exercise_sets WHERE student_id=? AND item_id=? AND day=? AND set_number=?',student.id,item.id,today(),number);
  else await dbRun(env.DB,`INSERT INTO student_exercise_sets(student_id,item_id,day,set_number,exercise_name,workout_label,load_kg,completed_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(student_id,item_id,day,set_number) DO UPDATE SET
    load_kg=excluded.load_kg,completed_at=excluded.completed_at`,student.id,item.id,today(),number,item.exercise,item.workout_label,weight,new Date().toISOString());
  return redirect(`/app/foco/${item.id}`);
});

route('GET','/app/mensalidade',async(request,env)=>{
  const student=await currentStudent(request,env); if(!student) return redirect('/app/entrar');
  if(student.must_change_password) return redirect('/app/senha');
  const own=await dbGet(env.DB,`SELECT s.id,s.name,s.monthly_value,s.due_day,s.start_date,p.name plan_name,p.months plan_months
    FROM students s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.id=?`,student.id);
  const invoices=await dbAll(env.DB,`SELECT reference_month,due_date,amount,status,paid_at
    FROM invoices WHERE student_id=? AND status!='cancelled' ORDER BY due_date DESC,id DESC`,student.id);
  const g=await gym(env);
  return htmlResponse(portalLayout('Minha mensalidade',portalInvoiceContent(own,invoices,g),g,student));
});

route('GET','/app/historico',async(request,env)=>{
  const student=await currentStudent(request,env); if(!student) return redirect('/app/entrar');
  if(student.must_change_password) return redirect('/app/senha');
  const history=await dbAll(env.DB,`SELECT day,workout_label,template_name,total_exercises,completed_exercises,updated_at
    FROM student_workout_daily WHERE student_id=? AND completed_exercises>0
    ORDER BY day DESC,updated_at DESC,id DESC LIMIT 90`,student.id);
  const hasSeries=await seriesReady(env.DB);
  const loads=hasSeries?await dbAll(env.DB,`SELECT day,exercise_name,workout_label,COUNT(*) sets,MAX(load_kg) max_load
    FROM student_exercise_sets WHERE student_id=? GROUP BY day,exercise_name,workout_label
    ORDER BY day DESC,exercise_name LIMIT 90`,student.id):[];
  const days=new Set([...history.map(h=>h.day),...loads.map(l=>l.day)]);
  const now=new Date(`${today()}T12:00:00Z`),weekday=(now.getUTCDay()+6)%7;
  const start=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-weekday);
  const week=Array.from({length:7},(_,n)=>{const day=new Date(start+n*86400000).toISOString().slice(0,10);return `<span class="${days.has(day)?'active':''}"><b>${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][n]}</b><small>${day.slice(-2)}</small>${days.has(day)?'✓':''}</span>`}).join('');
  const loadSection=hasSeries?`<div class="panel focus-history"><h2>Histórico de cargas e séries</h2><p>Maior carga registrada em cada exercício no dia. A carga pode ficar vazia.</p>${loads.length?`<div class="focus-history-list">${loads.map(l=>`<div><span><strong>${htmlEscape(l.exercise_name)}</strong><small>${brDate(l.day)} · ${htmlEscape(l.workout_label)} · ${l.sets} série(s)</small></span><b>${l.max_load===null?'Sem carga':`${l.max_load} kg`}</b></div>`).join('')}</div>`:'<p>Ainda não há séries registradas.</p>'}</div>`:'';
  const content=`<div class="portal-welcome"><span class="eyebrow">MEU HISTÓRICO</span><h1>Seu esforço, dia após dia 💪</h1><p>Veja os exercícios e séries que você registrou no aplicativo.</p><div class="portal-summary"><span>DIAS COM ATIVIDADE <strong>${days.size}</strong></span><span>ÚLTIMA ATIVIDADE <strong>${days.size?brDate([...days].sort().at(-1)):'—'}</strong></span></div></div><div class="panel focus-week"><h2>Frequência desta semana</h2><div class="focus-week-days">${week}</div><small>Mostra os dias em que você marcou exercícios ou registrou séries.</small></div><div class="panel"><div class="panel-head"><div><h2>Treinos registrados</h2><p>Até 90 registros recentes de exercícios marcados.</p></div></div>${historyTable(history)}</div>${loadSection}<p class="st-progress-note">Este histórico reflete as marcações feitas por você; não valida automaticamente a execução do exercício.</p><a class="btn secondary" href="/app">← Voltar aos meus treinos</a>`;
  return htmlResponse(portalLayout('Meu histórico',content,await gym(env),student));
});

route('POST',/^\/app\/exercicios\/(?<id>\d+)\/concluir$/,async(request,env,params)=>{
  const student=await currentStudent(request,env); if (!student) return redirect('/app/entrar');
  if (student.must_change_password) return redirect('/app/senha');
  const id=Number(params.id);
  const item=await dbGet(env.DB,`SELECT i.id,i.workout_label,i.template_id,sw.id assignment_id,t.name template_name
    FROM workout_template_items i JOIN student_workouts sw ON sw.template_id=i.template_id
    JOIN workout_templates t ON t.id=i.template_id
    WHERE i.id=? AND sw.student_id=? AND sw.active=1 ORDER BY sw.id DESC LIMIT 1`,id,student.id);
  if (!item) return htmlResponse('Exercício não pertence ao seu treino atual.',403);
  const p=await bodyParams(request),day=today(),stamp=new Date().toISOString();
  const mutation=p.get('done')==='0' ?
    env.DB.prepare('DELETE FROM student_exercise_checks WHERE student_id=? AND item_id=? AND day=?').bind(student.id,id,day) :
    env.DB.prepare('INSERT OR IGNORE INTO student_exercise_checks(student_id,item_id,day,completed_at) VALUES (?,?,?,?)').bind(student.id,id,day,stamp);
  const snapshot=env.DB.prepare(`INSERT INTO student_workout_daily
    (student_id,workout_assignment_id,day,workout_label,template_name,total_exercises,completed_exercises,updated_at)
    VALUES (?,?,?,?,?,
      (SELECT COUNT(*) FROM workout_template_items WHERE template_id=? AND workout_label=?),
      (SELECT COUNT(*) FROM student_exercise_checks c JOIN workout_template_items i ON i.id=c.item_id
       WHERE c.student_id=? AND c.day=? AND i.template_id=? AND i.workout_label=?),?)
    ON CONFLICT(student_id,workout_assignment_id,day,workout_label) DO UPDATE SET
      template_name=excluded.template_name,total_exercises=excluded.total_exercises,
      completed_exercises=excluded.completed_exercises,updated_at=excluded.updated_at`)
    .bind(student.id,item.assignment_id,day,item.workout_label,item.template_name,
      item.template_id,item.workout_label,student.id,day,item.template_id,item.workout_label,stamp);
  await env.DB.batch([mutation,snapshot]);
  return redirect('/app?bloco='+encodeURIComponent(item.workout_label));
});

// CONFIGURAÇÕES E PLANOS
route('GET', '/configuracoes', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const url = new URL(request.url), g = await gym(env);
  const plans = await dbAll(env.DB, 'SELECT p.*,(SELECT COUNT(*) FROM students s WHERE s.plan_id=p.id) student_count FROM plans p ORDER BY active DESC,months,name');
  const logo = g.logo_data ? `<img class="settings-logo-preview" id="logoPreview" src="${attr(g.logo_data)}" alt="">` : `<div class="settings-logo-preview placeholder" id="logoPreview">${htmlEscape(initials(g.gym_name))}</div>`;
  const content = `${flashFrom(url)}<div class="settings-grid">
  <form class="panel settings-card form" method="post" action="/configuracoes/academia"><div class="panel-head"><div><h2>Dados da academia</h2><p>Aparecem no sistema e nos recibos.</p></div></div><div class="logo-settings">${logo}<div><label class="btn secondary small file-btn">Escolher logo<input id="logoFile" type="file" accept="image/*" hidden></label><input type="hidden" id="logoData" name="logo_data" value="${attr(g.logo_data || '')}"><small>PNG/JPG pequeno. A imagem é comprimida e fica salva no banco D1.</small></div></div><div class="form-grid"><label class="span-2">Nome da academia<input name="gym_name" required value="${attr(g.gym_name)}"></label><label class="span-2">Frase / slogan<input name="slogan" value="${attr(g.slogan || '')}"></label><label>Telefone<input name="phone" class="phone-mask" value="${attr(g.phone || '')}"></label><label>WhatsApp<input name="whatsapp" class="phone-mask" value="${attr(g.whatsapp || '')}"></label><label>E-mail<input name="email" type="email" value="${attr(g.email || '')}"></label><label>CNPJ<input name="cnpj" value="${attr(g.cnpj || '')}"></label><label>CEP<div class="input-button"><input name="cep" id="cep" class="cep-mask" value="${attr(g.cep || '')}"><button type="button" id="buscarCep">Buscar</button></div></label><label>Rua<input name="street" id="street" value="${attr(g.street || '')}"></label><label>Número<input name="number" value="${attr(g.number || '')}"></label><label>Complemento<input name="complement" value="${attr(g.complement || '')}"></label><label>Bairro<input name="neighborhood" id="neighborhood" value="${attr(g.neighborhood || '')}"></label><label>Cidade<input name="city" id="city" value="${attr(g.city || '')}"></label><label>Estado<input name="state" id="state" maxlength="2" value="${attr(g.state || '')}"></label><label class="span-2">Rodapé do recibo<input name="receipt_footer" value="${attr(g.receipt_footer || '')}"></label></div><div class="form-actions"><button class="btn primary">Salvar dados</button></div></form>
  <div class="settings-column"><div class="panel"><div class="panel-head"><div><h2>Planos e valores</h2><p>Configure as opções usadas no cadastro.</p></div></div><div class="plan-list">${plans.map(p => `<form class="plan-row" method="post" action="/planos/${p.id}/editar"><input name="name" value="${attr(p.name)}" required><div><small>Meses</small><input name="months" type="number" min="1" value="${p.months}" required></div><div><small>Valor</small><input name="default_value" type="number" min="0" step="0.01" value="${p.default_value}" required></div><label class="switch-label"><input name="active" type="checkbox" value="1" ${p.active ? 'checked' : ''}><span>Ativo</span></label><button class="btn secondary small">Salvar</button>${Number(p.student_count) === 0 ? `<button class="btn danger small" type="submit" formaction="/planos/${p.id}/excluir" data-confirm-button="Excluir este plano?">×</button>` : ''}</form>`).join('')}</div><form class="new-plan" method="post" action="/planos"><strong>Novo plano</strong><input name="name" placeholder="Nome" required><input name="months" type="number" min="1" value="1" required><input name="default_value" type="number" min="0" step="0.01" placeholder="Valor" required><button class="btn primary small">Adicionar</button></form></div>
  <form class="panel form" method="post" action="/configuracoes/senha"><div class="panel-head"><div><h2>Segurança</h2><p>Use uma senha forte e exclusiva. Ao alterar, todas as sessões serão encerradas.</p></div></div><div class="form-grid one"><label>Senha atual<input type="password" name="current_password" required autocomplete="current-password"></label><label>Nova senha<input type="password" name="new_password" minlength="12" required autocomplete="new-password"></label><label>Confirmar nova senha<input type="password" name="confirm_password" minlength="12" required autocomplete="new-password"></label></div><div class="form-actions"><button class="btn primary">Alterar senha</button></div></form>
  <div class="panel note"><strong>☁ Versão online</strong><p>O sistema usa HTTPS da Cloudflare, sessões seguras no banco D1 e bloqueio temporário após várias tentativas de login.</p></div></div></div>`;
  return htmlResponse(layout('Configurações', content, 'settings', user, '', g));
});
route('POST', '/configuracoes/academia', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request);
  await dbRun(env.DB, 'UPDATE gym_settings SET gym_name=?,slogan=?,phone=?,whatsapp=?,email=?,cnpj=?,cep=?,street=?,number=?,complement=?,neighborhood=?,city=?,state=?,logo_data=?,receipt_footer=?,updated_at=? WHERE id=1', p.get('gym_name') || 'Academia Super Treino', p.get('slogan') || '', p.get('phone') || '', p.get('whatsapp') || '', p.get('email') || '', p.get('cnpj') || '', p.get('cep') || '', p.get('street') || '', p.get('number') || '', p.get('complement') || '', p.get('neighborhood') || '', p.get('city') || '', (p.get('state') || '').toUpperCase(), p.get('logo_data') || '', p.get('receipt_footer') || '', nowLocal());
  return redirect(`/configuracoes?ok=${encodeURIComponent('Dados da academia salvos')}`);
});
route('POST', '/configuracoes/senha', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request), u = await dbGet(env.DB, 'SELECT * FROM users WHERE id=?', user.id), np = String(p.get('new_password') || '');
  if (!u || !(await verifyPassword(String(p.get('current_password') || ''), u.password_hash)) || np !== String(p.get('confirm_password') || '') || np.length < 12 || np.length > 128) {
    return redirect(`/configuracoes?ok=${encodeURIComponent('Senha não alterada: confira os campos')}`);
  }
  if (np === String(p.get('current_password') || '')) return redirect('/configuracoes?ok='+encodeURIComponent('Escolha uma senha diferente da anterior.'));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').bind(await hashPassword(np), user.id),
    auditStatement(env,user,'senha_alterada','usuario',user.id,'Senha alterada pelo próprio usuário; hash não registrado'),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
  ]);
  return redirect(`/login?ok=${encodeURIComponent('Senha alterada. Entre novamente.')}`, { 'Set-Cookie': clearSessionCookie(request) });
});
route('POST', '/planos', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request);
  await dbRun(env.DB, 'INSERT INTO plans (name,months,default_value,active) VALUES (?,?,?,1)', p.get('name'), Number(p.get('months')), Number(p.get('default_value')));
  return redirect(`/configuracoes?ok=${encodeURIComponent('Plano adicionado')}`);
});
route('POST', /^\/planos\/(?<id>\d+)\/editar$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const p = await bodyParams(request);
  await dbRun(env.DB, 'UPDATE plans SET name=?,months=?,default_value=?,active=? WHERE id=?', p.get('name'), Number(p.get('months')), Number(p.get('default_value')), p.get('active') === '1' ? 1 : 0, Number(params.id));
  return redirect(`/configuracoes?ok=${encodeURIComponent('Plano atualizado')}`);
});
route('POST', /^\/planos\/(?<id>\d+)\/excluir$/, async (request, env, params) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const id = Number(params.id), c = Number((await dbGet(env.DB, 'SELECT COUNT(*) c FROM students WHERE plan_id=?', id))?.c || 0);
  if (!c) await dbRun(env.DB, 'DELETE FROM plans WHERE id=?', id);
  return redirect(`/configuracoes?ok=${encodeURIComponent(c ? 'Plano em uso não pode ser excluído' : 'Plano excluído')}`);
});

// GESTÃO DE USUÁRIOS E AUDITORIA (somente contas administrativas)
route('GET', '/seguranca', async (request,env) => {
 const user=await currentUser(request,env); if(!user) return redirect('/login');
 const g=await gym(env), url=new URL(request.url);
 const users=await dbAll(env.DB,'SELECT id,name,email,is_active,must_change_password,created_at FROM users ORDER BY is_active DESC,name');
 const logs=await dbAll(env.DB,'SELECT actor_name,action,entity_type,entity_id,description,old_data,new_data,created_at FROM audit_log ORDER BY id DESC LIMIT 60');
 const userRows=users.map(u=>`<div class="security-user"><div><strong>${htmlEscape(u.name)}${u.id===user.id?' (você)':''}</strong><small>${htmlEscape(u.email)}</small><span class="badge ${u.is_active?'success':'neutral'}">${u.is_active ? 'Ativo' : 'Desativado'}</span>${u.must_change_password?' <span class="badge warning">Aguardando troca de senha</span>':''}</div>${u.id===user.id?'':`<div class="security-user-actions"><form method="post" action="/seguranca/usuarios/${u.id}/${u.is_active?'desativar':'reativar'}" data-confirm="${u.is_active?'Desativar':'Reativar'} o acesso de ${attr(u.name)}?"><button class="btn ${u.is_active?'danger':'secondary'} small">${u.is_active?'Desativar':'Reativar'}</button></form><details><summary>Redefinir senha</summary><form class="form" method="post" action="/seguranca/usuarios/${u.id}/redefinir"><label>Senha provisória nova<input type="password" name="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>Confirme<input type="password" name="confirm_password" minlength="12" maxlength="128" required autocomplete="new-password"></label><button class="btn secondary small">Salvar senha provisória</button></form></details></div>`}</div>`).join('');
 const logsHtml=logs.map(l=>`<tr><td>${htmlEscape(brTimestamp(l.created_at))}</td><td>${htmlEscape(l.actor_name)}</td><td>${htmlEscape(l.action.replaceAll('_',' '))}</td><td>${htmlEscape(l.entity_type)} ${l.entity_id || ''}</td><td>${htmlEscape(l.description || '—')}${l.old_data || l.new_data ? `<details class="audit-detail"><summary>Ver antes/depois</summary><pre>Antes: ${htmlEscape(l.old_data || '—')}
Depois: ${htmlEscape(l.new_data || '—')}</pre></details>` : ''}</td></tr>`).join('');
 const content=`${flashFrom(url)}<div class="security-grid"><section class="panel"><div class="panel-head"><div><h2>Contas da academia</h2><p>Crie uma conta individual para cada proprietário. Todos os usuários criados aqui terão acesso administrativo.</p></div></div>${userRows}<details class="new-user"><summary class="btn primary">+ Criar nova conta</summary><form class="form" method="post" action="/seguranca/usuarios"><label>Nome<input name="name" required maxlength="100" autocomplete="off"></label><label>E-mail<input name="email" type="email" required maxlength="200" autocomplete="off"></label><label>Senha provisória (mínimo 12 caracteres)<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>Confirme a senha<input name="confirm_password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><p>A pessoa deverá escolher sua própria senha ao entrar pela primeira vez. Compartilhe a senha provisória por um canal seguro.</p><button class="btn primary">Criar conta</button></form></details></section><section class="panel"><h2>Proteções ativas</h2><p>✓ Sessão limitada a 12 horas<br>✓ Formulários protegidos contra CSRF<br>✓ Pagamentos protegidos contra clique duplo<br>✓ Exclusão de aluno substituída por arquivamento<br>✓ Ações financeiras com registro de auditoria</p><p>Backups: o Cloudflare D1 oferece Time Travel automático. Para cópias independentes de longo prazo, use o export SQL ou configure a rotina opcional do guia.</p><a class="btn secondary" href="/backup">Abrir backup</a></section></div><section class="panel"><div class="panel-head"><div><h2>Histórico de alterações</h2><p>Últimos 60 eventos registrados a partir da implantação desta versão. Senhas e dados completos não são gravados no histórico.</p></div></div><div class="table-wrap"><table><thead><tr><th>Quando (UTC)</th><th>Quem</th><th>Ação</th><th>Registro</th><th>Detalhe</th></tr></thead><tbody>${logsHtml || '<tr><td colspan="5" class="empty">Nenhuma alteração registrada ainda.</td></tr>'}</tbody></table></div></section>`;
 return htmlResponse(layout('Usuários e segurança',content,'security',user,'',g));
});
route('POST','/seguranca/usuarios',async(request,env)=>{
 const user=await currentUser(request,env); if(!user)return redirect('/login');
 const p=await bodyParams(request),name=String(p.get('name')||'').trim(),email=String(p.get('email')||'').trim().toLowerCase(),pwd=String(p.get('password')||'');
 if(name.length<2||name.length>100||email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||pwd.length<12||pwd.length>128||pwd!==p.get('confirm_password'))return htmlResponse('Confira nome, e-mail e senha (mínimo 12 caracteres).',400);
 const exists=await dbGet(env.DB,'SELECT id FROM users WHERE lower(email)=?',email); if(exists)return htmlResponse('Esse e-mail já possui uma conta. Volte à tela de segurança.',409);
 const id=await dbInsertId(env.DB,'INSERT INTO users(name,email,password_hash,is_active,must_change_password) VALUES (?,?,?,1,1)',name,email,await hashPassword(pwd));
 await dbRun(env.DB,'INSERT INTO audit_log(user_id,actor_name,action,entity_type,entity_id,description) VALUES(?,?,?,?,?,?)',user.id,user.name,'usuario_criado','usuario',id,'Conta administrativa criada');
 return redirect('/seguranca?ok='+encodeURIComponent('Conta criada. Oriente a pessoa a trocar a senha no primeiro acesso.'));
});
route('POST',/^\/seguranca\/usuarios\/(?<id>\d+)\/redefinir$/,async(request,env,params)=>{
 const user=await currentUser(request,env);if(!user)return redirect('/login');
 const id=Number(params.id);if(id===user.id)return htmlResponse('Use Configurações para alterar a sua própria senha.',400);
 const target=await dbGet(env.DB,'SELECT id FROM users WHERE id=?',id);
 if(!target)return htmlResponse('Usuário não encontrado',404);
 const p=await bodyParams(request),pwd=String(p.get('password')||'');
 if(pwd.length<12||pwd.length>128||pwd!==p.get('confirm_password'))return htmlResponse('Digite e confirme uma senha de 12 a 128 caracteres.',400);
 await env.DB.batch([
   env.DB.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').bind(await hashPassword(pwd),id),
   auditStatement(env,user,'senha_redefinida','usuario',id,'Senha provisória redefinida pelo administrador; todas as sessões encerradas'),
   env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)
 ]);
 return redirect('/seguranca?ok='+encodeURIComponent('Senha provisória redefinida. A pessoa precisará trocá-la no próximo acesso.'));
});
route('POST',/^\/seguranca\/usuarios\/(?<id>\d+)\/desativar$/,async(request,env,params)=>{
 const user=await currentUser(request,env);if(!user)return redirect('/login');
 const id=Number(params.id);if(id===user.id)return htmlResponse('Você não pode desativar sua própria conta.',400);
 const target=await dbGet(env.DB,'SELECT id,is_active FROM users WHERE id=?',id);
 if(!target)return htmlResponse('Usuário não encontrado',404);
 if(!target.is_active)return redirect('/seguranca');
 const res=await env.DB.batch([
   env.DB.prepare(`INSERT INTO audit_log(user_id,actor_name,action,entity_type,entity_id,description)
      SELECT ?,?,'usuario_desativado','usuario',id,'Conta desativada e sessões revogadas' FROM users
      WHERE id=? AND is_active=1 AND id!=? AND (SELECT COUNT(*) FROM users WHERE is_active=1)>1`).bind(user.id,user.name,id,user.id),
   env.DB.prepare('UPDATE users SET is_active=0 WHERE id=? AND id!=? AND is_active=1 AND (SELECT COUNT(*) FROM users WHERE is_active=1)>1').bind(id,user.id),
   env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND (SELECT is_active FROM users WHERE id=?)=0').bind(id,id)
 ]);
 if(!Number(res[1]?.meta?.changes))return htmlResponse('Não foi possível desativar a última conta ativa.',409);
 return redirect('/seguranca?ok='+encodeURIComponent('Conta desativada e sessões encerradas'));
});
route('POST',/^\/seguranca\/usuarios\/(?<id>\d+)\/reativar$/,async(request,env,params)=>{
 const user=await currentUser(request,env);if(!user)return redirect('/login');
 const id=Number(params.id),target=await dbGet(env.DB,'SELECT id,is_active FROM users WHERE id=?',id);
 if(!target)return htmlResponse('Usuário não encontrado',404);
 if(target.is_active)return redirect('/seguranca');
 await env.DB.batch([
  env.DB.prepare('UPDATE users SET is_active=1 WHERE id=?').bind(id),
  auditStatement(env,user,'usuario_reativado','usuario',id,'Acesso administrativo reativado')
 ]);
 return redirect('/seguranca?ok='+encodeURIComponent('Conta reativada'));
});

// RELATÓRIOS E EXPORTAÇÕES
route('GET', '/relatorios', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  await ensureCurrentInvoices(env);
  const g = await gym(env), active = Number((await dbGet(env.DB, "SELECT COUNT(*) c FROM students WHERE status='active'"))?.c || 0), inactive = Number((await dbGet(env.DB, "SELECT COUNT(*) c FROM students WHERE status!='active'"))?.c || 0);
  const invoices = await dbAll(env.DB, "SELECT * FROM invoices WHERE reference_month=? AND status!='cancelled'", currentReference());
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((a, b) => a + Number(b.amount), 0), overdue = invoices.filter(i => invoiceStatus(i) === 'Vencido'), openValue = invoices.filter(i => i.status === 'open').reduce((a, b) => a + Number(b.amount), 0);
  const months = [];
  const [cy, cm] = currentReference().split('-').map(Number);
  for (let offset = 5; offset >= 0; offset--) { const idx = cy * 12 + (cm - 1) - offset, y = Math.floor(idx / 12), m = (idx % 12) + 1, ref = `${y}-${String(m).padStart(2, '0')}`; const row = await dbGet(env.DB, "SELECT COALESCE(SUM(amount),0) total FROM invoices WHERE status='paid' AND substr(paid_at,1,7)=?", ref); months.push({ ref, total: Number(row?.total || 0) }); }
  const max = Math.max(...months.map(m => m.total), 1);
  const bdayRows = await dbAll(env.DB, "SELECT name,birth_date FROM students WHERE status='active' AND birth_date IS NOT NULL ORDER BY birth_date"), birthdays = bdayRows.filter(s => birthdayThisMonth(s.birth_date));
  const content = `<div class="report-actions"><div><span class="eyebrow">DESEMPENHO</span><h2>${htmlEscape(referenceLabel(currentReference()))}</h2></div><div><a class="btn secondary" href="/exportar/alunos.csv">Exportar alunos CSV</a><a class="btn secondary" href="/exportar/mensalidades.csv">Exportar mensalidades CSV</a></div></div><div class="kpis"><div class="kpi"><span class="kpi-icon">👥</span><div><small>Ativos</small><strong>${active}</strong><em>alunos</em></div></div><div class="kpi"><span class="kpi-icon">⏸</span><div><small>Inativos</small><strong>${inactive}</strong><em>alunos</em></div></div><div class="kpi"><span class="kpi-icon">R$</span><div><small>Recebido</small><strong>${money(totalPaid)}</strong><em>no mês</em></div></div><div class="kpi"><span class="kpi-icon">↗</span><div><small>A receber</small><strong>${money(openValue)}</strong><em>em aberto</em></div></div><div class="kpi"><span class="kpi-icon">!</span><div><small>Vencidas</small><strong>${overdue.length}</strong><em>mensalidades</em></div></div><div class="kpi"><span class="kpi-icon">🎂</span><div><small>Aniversários</small><strong>${birthdays.length}</strong><em>neste mês</em></div></div></div><div class="grid-2"><div class="panel"><div class="panel-head"><div><h2>Receita dos últimos 6 meses</h2><p>Somente pagamentos registrados</p></div></div><div class="bar-chart">${months.map(m => `<div class="bar-item"><div class="bar-value">${money(m.total)}</div><div class="bar-track"><span style="height:${Math.max(4, Math.round(m.total / max * 100))}%"></span></div><small>${new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: TZ }).format(new Date(Date.UTC(Number(m.ref.slice(0, 4)), Number(m.ref.slice(5, 7)) - 1, 2))).replace('.', '')}</small></div>`).join('')}</div></div><div class="panel"><div class="panel-head"><div><h2>Aniversariantes do mês</h2><p>Alunos ativos</p></div><span class="badge neutral">${birthdays.length}</span></div><div class="list">${birthdays.slice(0, 12).map(s => `<div class="list-row"><strong>${htmlEscape(s.name)}</strong><small>${brDate(s.birth_date)}</small></div>`).join('') || '<div class="empty">Nenhum aniversário neste mês.</div>'}</div></div></div>`;
  return htmlResponse(layout('Relatórios', content, 'reports', user, '', g));
});
route('GET', '/exportar/alunos.csv', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const rows = await dbAll(env.DB, 'SELECT s.*,p.name plan_name FROM students s LEFT JOIN plans p ON p.id=s.plan_id ORDER BY s.name');
  const lines = [['Nome', 'WhatsApp', 'Nascimento', 'CEP', 'Rua', 'Número', 'Complemento', 'Bairro', 'Cidade', 'Estado', 'Início', 'Plano', 'Valor do plano / cobrança', 'Vencimento', 'Status', 'Observações'].map(csvEscape).join(';')];
  for (const s of rows) lines.push([s.name, s.phone, s.birth_date, s.cep, s.street, s.number, s.complement, s.neighborhood, s.city, s.state, s.start_date, s.plan_name, s.monthly_value, s.due_day, s.status, s.notes].map(csvEscape).join(';'));
  return dataResponse('\ufeff' + lines.join('\r\n'), 'text/csv; charset=utf-8', `alunos-super-treino-${today()}.csv`);
});
route('GET', '/exportar/mensalidades.csv', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const rows = await dbAll(env.DB, 'SELECT i.*,s.name FROM invoices i JOIN students s ON s.id=i.student_id ORDER BY i.due_date DESC');
  const lines = [['Aluno', 'Referência', 'Vencimento', 'Valor', 'Status', 'Pago em', 'Forma', 'Recibo'].map(csvEscape).join(';')];
  for (const i of rows) lines.push([i.name, i.reference_month, i.due_date, i.amount, invoiceStatus(i), i.paid_at, i.payment_method, i.receipt_number].map(csvEscape).join(';'));
  return dataResponse('\ufeff' + lines.join('\r\n'), 'text/csv; charset=utf-8', `mensalidades-super-treino-${today()}.csv`);
});

// BACKUP ONLINE
route('GET', '/backup', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const g = await gym(env);
  const students = Number((await dbGet(env.DB, 'SELECT COUNT(*) c FROM students'))?.c || 0), invoices = Number((await dbGet(env.DB, 'SELECT COUNT(*) c FROM invoices'))?.c || 0), leads = Number((await dbGet(env.DB, 'SELECT COUNT(*) c FROM leads'))?.c || 0);
  const content = `<div class="backup-grid"><div class="backup-card"><div class="backup-icon">☁</div><span class="eyebrow">SEGURANÇA DOS DADOS</span><h2>Backup da versão online</h2><p>Baixe uma cópia JSON com os dados administrativos do sistema. Ela serve como cópia adicional e pode ser guardada fora da Cloudflare.</p><div class="backup-meta"><span>Registros principais</span><strong>${students} alunos · ${invoices} mensalidades · ${leads} leads</strong></div><a class="btn primary full" href="/backup/download">Baixar backup JSON</a></div><div class="panel backup-instructions"><h2>Backup recomendado</h2><ol><li>Use o botão ao lado para ter uma cópia simples dos dados.</li><li>Para um backup integral restaurável do D1, execute no computador: <code>npx wrangler d1 export super-treino-prod --remote --output=backup-super-treino.sql</code>.</li><li>Guarde o arquivo <code>.sql</code> em outro local.</li><li>O D1 possui Time Travel automático; no plano gratuito, a janela costuma ser de até 7 dias. Backups independentes exigem exportação agendada e armazenamento privado.</li></ol><div class="callout">Antes de qualquer migração ou alteração grande, faça o export SQL pelo Wrangler.</div></div></div>`;
  return htmlResponse(layout('Backup', content, 'backup', user, '', g));
});
route('GET', '/backup/download', async (request, env) => {
  const user = await currentUser(request, env); if (!user) return redirect('/login');
  const tables = ['gym_settings', 'plans', 'students', 'invoices', 'leads', 'workout_templates', 'workout_template_items', 'student_workouts', 'student_exercise_checks'];
  const data = { format: 'super-treino-online-backup-v1', created_at: new Date().toISOString(), timezone: TZ, tables: {} };
  for (const table of tables) data.tables[table] = await dbAll(env.DB, `SELECT * FROM ${table}`);
  return dataResponse(JSON.stringify(data, null, 2), 'application/json; charset=utf-8', `super-treino-backup-${today()}.json`);
});

function originAllowed(request) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true;

  const expected = new URL(request.url);
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  const loopback = host => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  const devLoopback = loopback(expected.hostname);

  // EXCLUSIVO do servidor HTTP local: o proxy do Wrangler e as proteções de
  // privacidade do navegador podem modificar ou omitir Origin/Referer.
  // Nessa situação, o primeiro administrador ainda exige SETUP_KEY; o login
  // exige senha; todos os demais POSTs exigem token CSRF por sessão.
  // No Worker público (HTTPS, domínio real) toda a checagem de origem continua.
  if (devLoopback && expected.protocol === 'http:') return true;

  // Para requisições normais, a origem do navegador precisa ser idêntica.
  // No Wrangler local, localhost e 127.0.0.1 podem se alternar nos proxies.
  // A exceção de desenvolvimento nunca se aplica ao endereço público do Worker.
  const sourceIsAllowed = header => {
    if (!header) return true;
    try {
      const supplied = new URL(header);
      if (supplied.origin === expected.origin) return true;
      return devLoopback && loopback(supplied.hostname) &&
        supplied.protocol === expected.protocol && supplied.port === expected.port;
    } catch { return false; }
  };

  // Se houver dois cabeçalhos, ambos devem ser compatíveis: não basta um só.
  if (origin || referer) return sourceIsAllowed(origin) && sourceIsAllowed(referer);
  if (fetchSite === 'same-origin') return true;

  // Alguns navegadores/escudos de privacidade omitem os três cabeçalhos
  // em formulários locais. O fallback abaixo é exclusivo de loopback;
  // em produção uma requisição sem prova da origem permanece bloqueada.
  return devLoopback && (fetchSite === null || fetchSite === 'none');
}

// Detecta uma origem realmente estrangeira (não trata Origin: null como estrangeira).
// A ausência dos cabeçalhos em navegadores privados exige tokens por formulário.
function explicitlyForeignOrigin(request) {
  const expected = new URL(request.url);
  const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  for (const name of ['Origin', 'Referer']) {
    const raw = request.headers.get(name);
    if (!raw || raw === 'null') continue;
    let supplied;
    try { supplied = new URL(raw); } catch { return true; }
    if (supplied.origin === expected.origin) continue;
    if (expected.protocol === 'http:' && loopback(expected.hostname) &&
        supplied.protocol === 'http:' && loopback(supplied.hostname) && supplied.port === expected.port) continue;
    return true;
  }
  return false;
}

async function csrfAllowed(request, env, pathname) {
  if (request.method !== 'POST' || pathname === '/login' || pathname === '/setup') return true;
  const user = await currentUser(request,env);
  if (!user) return false;
  const raw = await request.clone().text();
  if (raw.length > 7_000_000) return false;
  const posted = new URLSearchParams(raw).get('csrf_token');
  return Boolean(posted && safeEqualString(user.csrf_token,posted));
}

export default {
  async fetch(request, env) {
    try {
      if (!env.DB) return htmlResponse('<!doctype html><meta charset="utf-8"><h1>Banco D1 não configurado</h1><p>Crie o D1 e vincule-o como <strong>DB</strong> no arquivo wrangler.jsonc.</p>', 503);
      const url = new URL(request.url);
      // Formulários protegidos por tokens próprios podem ser enviados pelo Brave,
      // mesmo se o navegador não mandar Origin/Referer/Sec-Fetch-Site.
      // Origem estrangeira explícita é sempre recusada. Nunca afrouxar /setup.
      if (request.method === 'POST' && url.pathname === '/app/entrar') {
        if (explicitlyForeignOrigin(request)) return htmlResponse('Origem não permitida.',403);
        if (!(await portalLoginCsrfAllowed(request))) return htmlResponse('Login expirado. Atualize a página e tente novamente.',403);
      } else if (request.method === 'POST' && url.pathname.startsWith('/app/')) {
        if (explicitlyForeignOrigin(request)) return htmlResponse('Origem não permitida.',403);
        if (!(await studentCsrfAllowed(request,env))) return htmlResponse('Sessão ou formulário inválido. Faça login novamente.',403);
      } else if (request.method === 'POST' && url.pathname === '/login') {
        if (explicitlyForeignOrigin(request)) return htmlResponse('Origem não permitida. Abra o site oficial diretamente.', 403);
        if (!(await loginCsrfAllowed(request))) {
          return htmlResponse('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atualizar login</title><main style="font-family:system-ui;max-width:28rem;margin:5rem auto;padding:1.5rem"><h1>Atualize a tela de login</h1><p>Seu formulário expirou ou foi bloqueado pelo navegador. Nenhuma senha foi alterada.</p><a href="/login">Voltar ao login</a></main></html>',403);
        }
      } else if (request.method === 'POST' && url.pathname !== '/setup') {
        if (explicitlyForeignOrigin(request)) return htmlResponse('Origem não permitida. Abra o site oficial diretamente.', 403);
        if (!(await csrfAllowed(request, env, url.pathname))) return htmlResponse('Formulário inválido ou sessão expirada. Atualize a página e faça login novamente.', 403);
      } else if (!originAllowed(request)) {
        return htmlResponse('Origem não permitida. Atualize a página e tente novamente.', 403);
      }
      const u = await currentUser(request,env);
      if (u?.must_change_password && !url.pathname.startsWith('/app') && !['/conta/primeiro-acesso','/logout'].includes(url.pathname)) return redirect('/conta/primeiro-acesso');
      const found = matchRoute(request.method, url.pathname);
      if (found) return await found.handler(request, env, found.params);
      const user = await currentUser(request, env), g = await gym(env);
      return htmlResponse(layout('Página não encontrada', '<div class="empty big-empty"><h2>404</h2><p>Página não encontrada.</p><a class="btn secondary" href="/">Voltar ao Dashboard</a></div>', '', user, '', g), 404);
    } catch (err) {
      console.error(err);
      return htmlResponse(`<!doctype html><meta charset="utf-8"><title>Erro</title><style>body{font-family:system-ui;padding:40px;background:#f5f7fb;color:#172033}pre{white-space:pre-wrap;background:white;padding:20px;border-radius:12px}</style><h1>Erro interno</h1><p>Se o problema continuar, confira se o schema do banco foi aplicado e veja os logs do Worker.</p><p>Não exibimos detalhes internos por segurança. Caso persista, consulte os logs do Worker.</p>`, 500);
    }
  }
};
