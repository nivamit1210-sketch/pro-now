// Shared helpers for the customer-side button audit (audit_customer*.mjs).
process.env.PW_CHROMIUM ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
import { launchChromium } from '../browser.mjs';
import { setAddress } from './address.mjs';
export const URL0 = process.env.URL0 || 'http://127.0.0.1:4421/?time=day';
export async function open(tag = 'a') {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  p.on('filechooser', async (fc) => { await fc.setFiles(new URL('../public/world/avatar_01_portrait.webp', import.meta.url).pathname).catch(() => {}); });
  let n = 0;
  const shot = async (name) => { await p.waitForTimeout(500); const f = `out/audit/${tag}_${String(++n).padStart(2, '0')}_${name}.png`; await p.screenshot({ path: f }); return f; };
  const btnLoc = () => p.locator('[role=button],button,[role=checkbox],[role=radio],[role=link],a[href],[role=tab],[role=switch],[role=menuitem]').filter({ visible: true });
  const labelOf = async (el) => { const a = ((await el.getAttribute('aria-label')) || '').trim(); const t = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' '); return { a, t }; };
  const buttons = async () => { const loc = btnLoc(); const c = await loc.count(); const out = []; for (let i = 0; i < c; i++) { const { a, t } = await labelOf(loc.nth(i)); out.push(a || t); } return out; };
  const press = async (re, { nth = 0 } = {}) => { const loc = btnLoc(); const c = await loc.count(); let k = 0; for (let i = 0; i < c; i++) { const el = loc.nth(i); const { a, t } = await labelOf(el); const lab = re.test(a) ? a : t; if (re.test(lab)) { if (k++ < nth) continue; await el.evaluate((x) => x.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(100); await el.click({ force: true, timeout: 4000 }).catch((e) => errs.push('click fail ' + lab + ' ' + String(e).slice(0, 80))); await p.waitForTimeout(900); return lab; } } return null; };
  const text = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const has = async (s) => (await text()).includes(s);
  const sig = async () => (await text()).slice(0, 110);
  const signIn = async (phone = '0521234567') => {
    await p.goto(URL0); await p.locator('text=אני צריך מקצוען').first().waitFor({ timeout: 20000 });
    await p.waitForTimeout(800);
    await press(/^אני צריך מקצוען/); await p.getByLabel('מספר טלפון').fill(phone); await press(/^שליחת קוד/);
    await p.getByLabel('קוד האימות').fill('123456'); await press(/^כניסה/); await p.waitForTimeout(800);
  };
  const toHome = async (phone) => { await signIn(phone); await press(/^דילוג על ההסבר|^דלג$/); await p.waitForTimeout(500); await press(/^דמות 1$/); await press(/^(אישור הדמות|זו אני|זה אני|אישור)/); await p.waitForTimeout(1200); await setAddress(p, press); };
  const histBack = async () => { await p.goBack({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(900); };
  return { b, p, errs, shot, buttons, press, text, has, sig, signIn, toHome, histBack };
}
export async function toMatch(A, { svc = /^נזילה או דליפת מים/, cat = /^תיקונים בבית$/ } = {}) {
  const { p } = A; await A.toHome();
  await A.press(cat); await A.press(svc); await p.waitForTimeout(1000); await A.press(/^בקשת .* עכשיו$/); await p.waitForTimeout(1000);
  const ta = p.locator('textarea').filter({ visible: true }).first(); if (await ta.count()) await ta.fill('נוזל מים מתחת לכיור במטבח');
  await A.press(/^שליחת הקריאה/);
  for (let i = 0; i < 12 && !(await A.has('כן, מתאים לי')); i++) await p.waitForTimeout(1000);
  await p.waitForTimeout(800);
}
export const dumpFn = (A, L = console.log) => async (name) => { const f = await A.shot(name); L(`  [${name}] ${(await A.sig()).slice(0, 120)}\n     buttons: ${JSON.stringify(await A.buttons())}\n     shot: ${f}`); };
export async function toAssigned(A, opts) { await toMatch(A, opts); await A.press(/^כן, מתאים לי/); await A.p.waitForTimeout(3000); }
