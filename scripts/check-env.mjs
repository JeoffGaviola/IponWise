#!/usr/bin/env node
/**
 * IponWise environment doctor. Run from the project root:   node scripts/check-env.mjs
 * Reads backend/.env, frontend/.env and frontend/.env.local, tells you what is still a placeholder, and
 * flags the one mistake that really hurts: a service-role / database secret in a browser-visible file.
 * It never prints your secrets and never makes network calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = /YOUR_|REPLACE_ME|CHANGE_ME|example\.com/i;
let problems = 0, warnings = 0;

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const mask = (v) => (v.length > 12 ? `${v.slice(0, 6)}…(${v.length} chars)` : '(set)');
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => { warnings++; console.log(`  ! ${m}`); };
const bad = (m) => { problems++; console.log(`  ✗ ${m}`); };

function need(env, key, { secret = false, validate } = {}) {
  const v = env?.[key];
  if (!v) return bad(`${key} is missing`);
  if (PLACEHOLDER.test(v)) return bad(`${key} still has the placeholder value — replace it with your own`);
  if (validate) { const msg = validate(v); if (msg) return bad(`${key}: ${msg}`); }
  ok(`${key} ${secret ? mask(v) : v.length > 60 ? mask(v) : v}`);
}

console.log('\nbackend/.env');
const be = read('backend/.env');
if (!be) bad('file not found — copy backend/.env.example to backend/.env');
else {
  need(be, 'DATABASE_URL', { secret: true, validate: (v) => (/^postgres(ql)?(\+\w+)?:\/\//.test(v) ? '' : 'must start with postgresql://') });
  need(be, 'SUPABASE_URL', { validate: (v) => (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(v) ? '' : 'expected https://<project-ref>.supabase.co') });
  need(be, 'SUPABASE_ANON_KEY', { secret: true });
  need(be, 'SUPABASE_SERVICE_ROLE_KEY', { secret: true });
  need(be, 'FRONTEND_ORIGINS', { validate: (v) => (v.split(',').some((o) => o.trim().endsWith('/')) ? 'origins must not end with a slash' : '') });
  if ((be.APP_ENV || '') === 'production' && /localhost|127\.0\.0\.1/.test(be.FRONTEND_ORIGINS || '')) warn('APP_ENV=production but FRONTEND_ORIGINS still lists localhost');
}

console.log('\nfrontend/.env  (+ frontend/.env.local overrides it)');
const fe = read('frontend/.env'); const fl = read('frontend/.env.local');
if (!fe && !fl) bad('neither frontend/.env nor frontend/.env.local exists');
const merged = { ...(fe || {}), ...(fl || {}) };
if (!fl) bad('frontend/.env.local not found — copy frontend/.env.local.example to frontend/.env.local');
need(merged, 'VITE_SUPABASE_URL', { validate: (v) => (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(v) ? '' : 'expected https://<project-ref>.supabase.co') });
need(merged, 'VITE_SUPABASE_ANON_KEY', { secret: true });
need(merged, 'VITE_API_BASE_URL', { validate: (v) => (v.endsWith('/') ? 'remove the trailing slash' : /^https?:\/\//.test(v) ? '' : 'must start with http:// or https://') });
if (PLACEHOLDER.test(merged.VITE_SUPPORT_EMAIL || 'YOUR_')) warn('VITE_SUPPORT_EMAIL is still a placeholder (only affects the Terms/Privacy pages)');

// Safety: nothing secret may live in a VITE_ variable — those are shipped to every visitor's browser.
for (const [file, env] of [['frontend/.env', fe], ['frontend/.env.local', fl]]) {
  for (const [k, v] of Object.entries(env || {})) {
    if (/service_role|SERVICE_ROLE/i.test(k)) bad(`${file}: ${k} is a SERVER secret and must NOT be in a frontend file`);
    if (/^eyJ/.test(v)) { try { const role = JSON.parse(Buffer.from(v.split('.')[1], 'base64url').toString()).role; if (role === 'service_role') bad(`${file}: ${k} contains a service_role key — remove it immediately and rotate it in Supabase`); } catch { /* not a JWT we can read */ } }
    if (/postgres(ql)?:\/\//i.test(v)) bad(`${file}: ${k} looks like a database connection string and must NOT be in a frontend file`);
  }
}
if (be?.SUPABASE_URL && merged.VITE_SUPABASE_URL && !PLACEHOLDER.test(be.SUPABASE_URL) && be.SUPABASE_URL.replace(/\/$/, '') !== merged.VITE_SUPABASE_URL.replace(/\/$/, '')) bad('backend SUPABASE_URL and frontend VITE_SUPABASE_URL point to different projects — sign-in will fail with 401');

console.log(`\n${problems ? `✗ ${problems} problem(s) to fix` : '✓ Environment looks good'}${warnings ? `, ${warnings} warning(s)` : ''}.${problems ? '\n  Step-by-step help: docs/SUPABASE_SETUP.md' : ''}\n`);
process.exit(problems ? 1 : 0);
