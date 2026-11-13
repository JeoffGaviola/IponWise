/**
 * IponWise end-to-end test. Drives a REAL browser through the REAL React build, which talks to the REAL
 * FastAPI backend and PostgreSQL. Only Supabase Auth is replaced by backend/tests/support/fake_gotrue.py
 * (so Google/Facebook below are a *simulated* provider round trip, not real Google/Facebook).
 *
 *   APP_URL=http://127.0.0.1:4173 API_URL=http://127.0.0.1:8000 AUTH_URL=http://127.0.0.1:54321 node run.mjs
 *   Set CHROME_PATH to your Chrome/Chromium; otherwise the bundled @sparticuz/chromium (Linux) is used.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import QRCode from 'qrcode';

const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const API = process.env.API_URL || 'http://127.0.0.1:8000';
const SHOTS = path.join(path.dirname(new URL(import.meta.url).pathname), 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};

let passed = 0; const failures = [];
const check = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failures.push(`${name} ${detail}`); console.log(`  ✗ ${name} ${detail}`); } };
const step = (title) => console.log(`\n▶ ${title}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  let executablePath = process.env.CHROME_PATH; let args = ['--no-sandbox', '--disable-dev-shm-usage'];
  if (!executablePath) { const chromium = (await import('@sparticuz/chromium')).default; executablePath = await chromium.executablePath(); args = [...chromium.args.filter((a) => !/single-process|no-zygote/.test(a)), '--no-sandbox']; }
  return puppeteer.launch({ executablePath, args, headless: 'shell' });
}

/** Opening an isolated context occasionally fails on small CI machines; retry before giving up. */
async function newPage(browser, viewport = VIEWPORTS.desktop) {
  for (let attempt = 1; ; attempt++) {
    try { return await createPage(browser, viewport); } catch (error) { if (attempt >= 3) throw error; await sleep(1500); }
  }
}

async function createPage(browser, viewport) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  page.errors = []; page.posts = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  // Google Fonts are an external CDN; they are allowed to be unreachable (offline CI) without being an app error.
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) page.errors.push(`console: ${m.text()}`); });
  // Chrome reports a successful body-less 204 (Supabase logout) as ERR_ABORTED even though the server answered.
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)\.com|favicon|\/auth\/v1\/logout/.test(r.url())) page.errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('request', (r) => { if (r.url().startsWith(API) && r.method() !== 'GET') page.posts.push({ url: r.url(), method: r.method(), body: r.postData() || '' }); });
  return page;
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const gone = (page, selector, timeout = 15000) => page.waitForFunction((s) => !document.querySelector(s), { timeout }, selector);

async function field(page, label, nth = 0) {
  const h = await page.evaluateHandle((label, nth) => {
    const root = document.querySelector('[role="dialog"]') || document;
    const ls = [...root.querySelectorAll('label')].filter((l) => l.textContent.trim().startsWith(label));
    const l = ls[nth]; return l ? document.getElementById(l.htmlFor) : null;
  }, label, nth);
  const el = h.asElement(); if (!el) throw new Error(`field not found: ${label}`); return el;
}
async function fill(page, label, value, nth = 0) { const el = await field(page, label, nth); await el.click({ clickCount: 3 }); await el.press('Backspace'); await el.type(String(value)); }
async function button(page, label, { exact = true, scope = 'body' } = {}) {
  const h = await page.evaluateHandle((label, exact, scope) => {
    const root = document.querySelector(scope) || document.body;
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const els = [...root.querySelectorAll('button, a.btn')].filter((b) => !b.disabled && b.offsetParent !== null);
    return els.find((b) => (exact ? norm(b.textContent) === label : norm(b.textContent).includes(label))) || null;
  }, label, exact, scope);
  const el = h.asElement(); if (!el) throw new Error(`button not found: ${label}`); return el;
}
const click = async (page, label, opts) => { const b = await button(page, label, opts); await b.evaluate((e) => e.scrollIntoView({ block: 'center' })); await b.click(); };
async function openPage(page, label) {
  // Phones/tablets use a slide-in drawer: make sure it is open (aria-expanded), then click inside it. Retry the whole sequence.
  for (let attempt = 1; ; attempt++) {
    try {
      const burger = await page.$('.menu-button');
      if (burger && (await burger.isVisible())) {
        if ((await burger.evaluate((b) => b.getAttribute('aria-expanded'))) !== 'true') await burger.click();
        await page.waitForFunction(() => { const r = document.querySelector('.sidebar')?.getBoundingClientRect(); return !!r && r.width > 0 && r.left >= -1 && r.left < 4; }, { timeout: 4000 });
        await sleep(450);
      }
      await click(page, label, { exact: false, scope: '.sidebar' });
      break;
    } catch (error) { if (attempt >= 4) throw error; await sleep(700); }
  }
  await sleep(450);
}
/** Puppeteer reloads the page when mobile emulation toggles, so wait for the app to settle again. */
const dialog = '[role="dialog"]';
const closeDialogWait = (page) => gone(page, dialog, 8000);

/** EMVCo / QR Ph style payload with a correct CRC, like the "Receive money" code of an e-wallet. */
function crc16(s) { let c = 0xffff; for (const ch of s) { c ^= ch.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); }
const tlv = (t, v) => `${t}${String(v.length).padStart(2, '0')}${v}`;
function walletQr() {
  const body = tlv('00', '01') + tlv('01', '11') + tlv('26', tlv('00', 'com.p2pqrpay') + tlv('01', 'GXCHPHM2XXX') + tlv('02', 'P2P') + tlv('03', '09171234567')) + tlv('52', '6016') + tlv('53', '608') + tlv('58', 'PH') + tlv('59', 'MARIA S') + tlv('60', 'BUTUAN') + '6304';
  return body + crc16(body);
}

const browser = await launch();
const stamp = Date.now();
const EMAIL = `maria.${stamp}@example.test`; const PASSWORD = 'Ipon-2026!ok';
const ctxErrors = [];

try {
  /* ---------------------------------------------------------------------------------- login screen */
  step('Sign-in screen: social buttons first, then manual registration');
  const page = await newPage(browser);
  await page.goto(APP, { waitUntil: 'networkidle2' });
  await waitText(page, 'Welcome back'); await sleep(1800);
  await shot(page, '01-login-desktop');
  const order = await page.evaluate(() => [...document.querySelectorAll('.auth-panel-inner button, .auth-panel-inner input')].map((e) => (e.textContent || e.getAttribute('type') || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 5));
  check('"Continue with Google" is the first action', order[0] === 'Continue with Google', JSON.stringify(order));
  check('"Continue with Facebook" is the second action', order[1] === 'Continue with Facebook', JSON.stringify(order));
  check('manual email form follows the social buttons', /email|Forgot|password/i.test(order.slice(2).join(' ')), JSON.stringify(order));
  check('illustration scene is rendered', !!(await page.$('.auth-scene svg.scene-tall')));

  /* ---------------------------------------------------------------------------------- manual registration */
  step('Manual registration → "Signing you in" transition → first-run dashboard');
  await click(page, 'Create an account');
  await waitText(page, 'Create your account');
  await fill(page, 'Full name', 'Maria Santos'); await fill(page, 'Email', EMAIL);
  await fill(page, 'Password', 'abc'); await fill(page, 'Confirm password', 'abc');
  await click(page, 'Create account');
  await waitText(page, 'Use at least 8 characters');
  check('weak password is rejected with a clear message', true);
  await fill(page, 'Password', PASSWORD); await fill(page, 'Confirm password', 'different-password');
  await click(page, 'Create account'); await waitText(page, 'passwords don’t match');
  check('mismatched confirm-password is caught', true);
  await fill(page, 'Confirm password', PASSWORD);
  await click(page, 'Create account');
  await page.waitForSelector('.splash-enter', { timeout: 10000 });
  check('a full-screen "Signing you in" transition is shown on login', (await text(page)).includes('Signing you in'));
  await shot(page, '02-signing-in-splash');
  await gone(page, '.splash', 20000);
  await waitText(page, 'Get started with IponWise');
  check('dashboard opens after the transition', true);
  check('first-run guide shows 0 of 6 steps', (await text(page)).includes('0 of 6 steps complete'));
  check('every step has a clear action label', (await text(page)).includes('Browse goal ideas') && (await text(page)).includes('Add an account') && (await text(page)).includes('Create a reminder'));
  await sleep(500); await shot(page, '03-dashboard-first-run');

  /* ---------------------------------------------------------------------------------- goal from an idea */
  step('Goal ideas: laptop purchase planner');
  await click(page, 'Browse goal ideas');
  await waitText(page, 'Goal ideas'); await sleep(500);
  await shot(page, '04-goal-ideas');
  const shuffled = async () => page.evaluate(() => [...document.querySelectorAll('.idea-card h3')].map((h) => h.textContent));
  const before = await shuffled();
  await click(page, 'Shuffle ideas'); await sleep(300);
  const after = await shuffled();
  check('Shuffle ideas offers different options', JSON.stringify(before) !== JSON.stringify(after), `${before} → ${after}`);
  await click(page, 'Big purchases'); await sleep(250);
  const bigTitles = await shuffled();
  check('"Big purchases" lists laptop, motorcycle and car', ['New laptop', 'Motorcycle', 'Car down payment'].every((t) => bigTitles.includes(t)), bigTitles.join(','));
  await click(page, 'Use this idea: New laptop', { exact: false });
  await page.waitForSelector(dialog);
  await sleep(500);
  const prefill = { name: await (await field(page, 'Goal name')).evaluate((e) => e.value), target: await (await field(page, 'Target amount')).evaluate((e) => e.value), date: await (await field(page, 'Target date')).evaluate((e) => e.value) };
  check('laptop idea pre-fills name, target and a target date', prefill.name === 'New laptop' && Number(prefill.target) === 45000 && /^\d{4}-\d{2}-\d{2}$/.test(prefill.date), JSON.stringify(prefill));
  check('purchase planner is offered for a laptop', (await text(page)).includes('Plan the purchase'));
  await shot(page, '05-goal-modal-laptop');
  await click(page, 'Create goal');
  await closeDialogWait(page);
  await waitText(page, 'created successfully');
  check('goal saved through the API and shown as a card', (await text(page)).includes('New laptop'));
  // a second, different goal: hospital bills (essential)
  await click(page, 'Emergencies & health'); await sleep(250);
  await click(page, 'Use this idea: Hospital bill fund', { exact: false });
  await page.waitForSelector(dialog); await click(page, 'Create goal'); await closeDialogWait(page);
  await waitText(page, 'Hospital bill fund');
  check('a second, different goal type (hospital bills) can be created', true);

  /* ---------------------------------------------------------------------------------- deposit */
  step('Record a deposit into the laptop goal');
  await openPage(page, 'Dashboard');
  await click(page, 'Record your first deposit', { exact: false }).catch(() => click(page, 'Add a deposit', { exact: false }));
  await page.waitForSelector(dialog);
  await fill(page, 'Amount', '12000');
  const goalSelect = await field(page, 'Add to a savings goal').catch(() => null);
  if (goalSelect) { const opts = await goalSelect.evaluate((s) => [...s.options].map((o) => ({ v: o.value, t: o.textContent }))); const laptop = opts.find((o) => /laptop/i.test(o.t)); if (laptop) await goalSelect.select(laptop.v); }
  await click(page, 'Record deposit');
  await closeDialogWait(page); await page.waitForFunction(() => /Added .*12,000|deposit has been recorded/.test(document.body.innerText), { timeout: 15000 }); check('deposit recorded through the API', true); await sleep(700);

  /* ---------------------------------------------------------------------------------- wallets: card */
  step('Wallets: add an ATM card — only the last 4 digits may leave the browser');
  await openPage(page, 'Wallets & accounts');
  await waitText(page, 'Tracking only');
  await shot(page, '06-wallets-empty');
  await click(page, 'Add ATM card');
  await page.waitForSelector(dialog);
  await fill(page, 'Card number or last 4 digits', '4242424242424241');
  await fill(page, 'Card name', 'Payroll ATM'); await fill(page, 'Bank or issuer', 'BDO'); await fill(page, 'Balance', '12500.50');
  await click(page, 'Add card'); await waitText(page, 'doesn’t look valid');
  check('a mistyped card number is rejected on the device (Luhn check)', true);
  await fill(page, 'Card number or last 4 digits', '4242424242424242');
  await sleep(200);
  check('network and masked number preview appear', (await text(page)).includes('Visa •••• 4242'));
  await shot(page, '07-card-modal');
  page.posts.length = 0;
  await click(page, 'Add card'); await closeDialogWait(page); await waitText(page, 'Payroll ATM');
  const cardPost = page.posts.find((p) => p.url.endsWith('/api/wallets') && p.method === 'POST');
  check('card request reached the API', !!cardPost);
  check('the full card number was NEVER sent to the server', !!cardPost && !cardPost.body.includes('4242424242424242') && !/4242 4242/.test(cardPost.body), cardPost?.body);
  check('only last 4 + network were sent', !!cardPost && cardPost.body.includes('"card_last4":"4242"') && cardPost.body.includes('"card_network":"visa"'));
  check('card shows as "Visa •••• 4242"', (await text(page)).includes('Visa •••• 4242'));
  const html = await page.content();
  check('the full number appears nowhere in the page', !html.includes('4242424242424242') && !html.includes('4242 4242 4242 4242'));

  /* ---------------------------------------------------------------------------------- wallets: QR */
  step('Wallets: scan an e-wallet QR (image upload path)');
  const qrFile = path.join(os.tmpdir(), `gcash-qr-${stamp}.png`);
  await QRCode.toFile(qrFile, walletQr(), { width: 420, margin: 4, errorCorrectionLevel: 'M' });
  await click(page, 'Scan e-wallet QR');
  await page.waitForSelector(dialog);
  await click(page, 'Upload image', { exact: false });
  const input = await page.$('input[type=file]'); await input.uploadFile(qrFile);
  await waitText(page, 'QR code read', 15000);
  check('QR decoded in the browser and GCash detected', (await text(page)).includes('looks like GCash'));
  check('provider and account name are pre-filled', (await (await field(page, 'Provider')).evaluate((e) => e.value)) === 'GCash');
  await shot(page, '08-qr-confirm');
  await fill(page, 'Balance in GCash', '3200');
  page.posts.length = 0;
  await click(page, 'Add account'); await closeDialogWait(page); await waitText(page, 'GCash wallet');
  const qrPost = page.posts.find((p) => p.url.endsWith('/api/wallets'));
  check('QR account saved with source "qr" and a 4-char reference', !!qrPost && qrPost.body.includes('"source":"qr"') && qrPost.body.includes('"account_tail":"4567"'), qrPost?.body);
  check('no balance was read from the QR — the typed balance was saved', !!qrPost && qrPost.body.includes('"balance":3200'));
  check('"Scanned from QR" badge shown', (await text(page)).includes('Scanned from QR'));

  /* ---------------------------------------------------------------------------------- balance, history, funding */
  step('Update balance, history and funding check');
  await click(page, 'Update balance: GCash wallet', { exact: false });
  await page.waitForSelector(dialog);
  await fill(page, 'Current balance', '2800');
  await click(page, 'Save new balance'); await closeDialogWait(page); await waitText(page, 'balance updated');
  await click(page, 'History: GCash wallet', { exact: false });
  await page.waitForSelector(dialog); await waitText(page, 'balance history');
  const hist = await page.evaluate(() => [...document.querySelectorAll('.history-list li')].map((li) => li.innerText.replace(/\s+/g, ' ')));
  check('history lists the original and updated balances', hist.length === 2 && /2,800/.test(hist[0]) && /3,200/.test(hist[1]), JSON.stringify(hist));
  await shot(page, '09-wallet-history');
  await click(page, 'Close'); await closeDialogWait(page);
  check('funding check compares goal savings with tracked accounts', (await text(page)).includes('Your goal savings are backed by your accounts'));
  await sleep(300); await shot(page, '10-wallets-desktop');

  /* ---------------------------------------------------------------------------------- dashboard populated */
  step('Dashboard: progress is computed from real data');
  await openPage(page, 'Dashboard'); await sleep(900);
  const dash = await text(page);
  check('guide progress advanced (goal, deposit, account done)', /[3-5] of 6 steps complete/.test(dash), dash.match(/\d of 6 steps complete/)?.[0]);
  check('accounts panel lists the tracked accounts', dash.includes('Where your money is kept') && dash.includes('Payroll ATM'));
  check('deposit is reflected in the recorded balance', /12,000/.test(dash));
  await shot(page, '11-dashboard-desktop');

  /* ---------------------------------------------------------------------------------- persistence */
  step('Hide the guide: persisted on the server, survives reload; can be restored in settings');
  await click(page, 'Hide guide'); await waitText(page, 'Guide hidden');
  await page.reload({ waitUntil: 'networkidle2' }); await gone(page, '.splash', 20000); await waitText(page, 'Goal progress');
  check('guide stays hidden after a reload (stored in the database)', !(await text(page)).includes('Get started with IponWise'));
  await openPage(page, 'Profile & settings'); await waitText(page, 'Get started guide');
  const sw = await page.$('button[role=switch][aria-label="Show the Get started guide"]');
  await sw.click(); await waitText(page, 'preferences have been saved'); await openPage(page, 'Dashboard');
  check('guide can be shown again from Profile & settings', (await text(page)).includes('Get started with IponWise'));

  /* ---------------------------------------------------------------------------------- sign out */
  step('Sign out: "Signing you out" transition, then the sign-in screen');
  await click(page, 'Hide guide'); await sleep(600);
  await page.click('.account-trigger'); await sleep(250);
  await click(page, 'Sign out', { exact: false, scope: '.menu' });
  await page.waitForSelector('.splash-leave', { timeout: 8000 });
  check('a full-screen "Signing you out" transition is shown on logout', (await text(page)).includes('Signing you out'));
  await shot(page, '12-signing-out-splash');
  await gone(page, '.splash', 15000); await waitText(page, 'Welcome back');
  check('returns to the sign-in screen after the transition', true);
  const leftover = await page.evaluate(() => Object.keys(localStorage).filter((k) => /sb-.*-auth-token/.test(k)));
  check('the session is cleared from this device', leftover.length === 0, leftover.join(','));

  /* ---------------------------------------------------------------------------------- login errors + login */
  step('Sign in: wrong password, then the right one');
  await fill(page, 'Email', EMAIL); await fill(page, 'Password', 'wrong-password');
  await click(page, 'Sign in'); await waitText(page, 'Couldn’t sign in', 8000);
  check('a wrong password shows an error and does not sign in', !(await page.$('.splash-enter')));
  await fill(page, 'Password', PASSWORD); await click(page, 'Sign in');
  await page.waitForSelector('.splash-enter', { timeout: 8000 });
  await gone(page, '.splash', 20000); await waitText(page, 'Goal progress');
  check('correct credentials sign in again with the transition', true);
  check('data created earlier is still there (stored in the database)', (await text(page)).includes('Payroll ATM'));
  page.errors.length && ctxErrors.push(...page.errors);
  await page.browserContext().close();   // free memory before the next independent flows

  /* ---------------------------------------------------------------------------------- social login (simulated provider) */
  for (const [provider, person] of [['Google', 'Maria Santos'], ['Facebook', 'Juan dela Cruz']]) {
    step(`Continue with ${provider} (simulated provider round trip)`);
    const p = await newPage(browser);
    await p.goto(APP, { waitUntil: 'networkidle2' }); await waitText(p, 'Welcome back');
    await click(p, `Continue with ${provider}`);
    await p.waitForSelector('.splash-enter', { timeout: 15000 });
    check(`${provider}: "Signing you in" transition shown after returning from the provider`, true);
    await gone(p, '.splash', 25000); await waitText(p, 'Get started with IponWise');
    const t = await text(p);
    check(`${provider}: signed in as the provider's name`, t.includes(person.split(' ')[0]), t.slice(0, 80));
    check(`${provider}: tokens were removed from the address bar`, !p.url().includes('access_token'), p.url());
    check(`${provider}: a profile row was created for the new user`, t.includes('0 of 6 steps complete'));
    if (provider === 'Google') {
      for (const [name, vp] of Object.entries(VIEWPORTS)) {
        const g = await newPage(browser, vp);
        await g.goto(APP, { waitUntil: 'networkidle2' }); await waitText(g, 'Welcome back');
        await click(g, 'Continue with Google'); await g.waitForSelector('.splash-enter', { timeout: 15000 });
        await gone(g, '.splash', 25000); await waitText(g, 'Get started with IponWise'); await sleep(500);
        check(`first-run guide fits the ${name} screen`, await g.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
        await shot(g, `22-guide-${name}`);
        ctxErrors.push(...g.errors); await g.browserContext().close();
      }
    }
    ctxErrors.push(...p.errors);
    await p.browserContext().close();
  }

  /* ---------------------------------------------------------------------------------- responsive */
  step('Responsive layouts: phone, tablet, desktop');
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    const r = await newPage(browser, vp);
    await r.goto(APP, { waitUntil: 'networkidle2' }); await waitText(r, 'Welcome back'); await sleep(1800);
    check(`login has no horizontal scroll on ${name}`, await r.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await shot(r, `20-login-${name}`);
    await fill(r, 'Email', EMAIL); await fill(r, 'Password', PASSWORD); await click(r, 'Sign in');
    await gone(r, '.splash', 25000); await waitText(r, 'Goal progress');
    for (const label of ['Dashboard', 'Savings goals', 'Wallets & accounts']) {
      await openPage(r, label); await sleep(800);
      const overflow = await r.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${label} fits the ${name} screen (no sideways scroll)`, overflow <= 1, `overflow ${overflow}px`);
      await r.evaluate(() => window.scrollTo(0, 0));
      await shot(r, `21-${label.split(' ')[0].toLowerCase()}-${name}`);
    }
    ctxErrors.push(...r.errors); await r.browserContext().close();
  }

  step('Browser health');
  check('no uncaught errors or console errors during the whole run', ctxErrors.length === 0, ctxErrors.slice(0, 5).join(' | '));
} catch (error) {
  failures.push(`UNEXPECTED: ${error.stack || error}`); console.log(`\n✗ UNEXPECTED: ${error.stack || error}`);
  const pages = await browser.pages(); for (const [i, p] of pages.entries()) await p.screenshot({ path: path.join(SHOTS, `zz-failure-${i}.png`) }).catch(() => {});
} finally { await browser.close(); }

console.log(`\n${failures.length ? 'FAILED' : 'PASSED'}: ${passed} checks passed, ${failures.length} failed`);
failures.forEach((f) => console.log(` - ${f}`));
process.exit(failures.length ? 1 : 0);
