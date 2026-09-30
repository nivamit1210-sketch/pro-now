// A professional of ANY trade joins and works one sample call — Amit's vet, end to end, on a phone.
// ABOUT="וטרينר" NAME="דנה כהן" TAG=vet node qa/join_trade.mjs
import { launchChromium } from '../browser.mjs';
import fs from 'node:fs';
const TAG = process.env.TAG || 'trade', ABOUT = process.env.ABOUT || 'וטרינר', NAME = process.env.NAME || 'דנה כהן';
const b = await launchChromium();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
const log = []; let n = 0;
const shot = async (name) => { await p.waitForTimeout(800); await p.screenshot({ path: `out/${TAG}_${String(++n).padStart(2, '0')}_${name}.png` }); log.push(`--- ${name}\n` + (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700)); };
const press = async (re) => { const loc = p.locator('[role=button],button,[role=radio],[role=checkbox]').filter({ visible: true }); const c = await loc.count(); for (let i = 0; i < c; i++) { const el = loc.nth(i); const a = ((await el.getAttribute('aria-label')) || '').trim(); const t = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' '); const lab = re.test(a) ? a : t; if (re.test(lab)) { await el.evaluate((x) => x.scrollIntoView({ block: 'center' })); await el.click({ force: true }); await p.waitForTimeout(800); return lab; } } return null; };
try {
  await p.goto('http://127.0.0.1:4421/?time=day'); await p.locator('text=אני בעל מקצוע').first().waitFor();
  await press(/^אני בעל מקצוע/); await p.getByLabel('מספר טלפון').fill('054' + String(Date.now()).slice(-7)); await press(/^שליחת קוד/); await p.getByLabel('קוד האימות').fill('123456'); await press(/^כניסה/);
  for (let k = 0; k < 4; k++) await press(/^הבא$/); await press(/^בואו נתחיל|^בוא נתחיל/); await press(/^בוא נתחיל/);
  await p.getByLabel('תיאור חופשי של העבודה שלך').pressSequentially(ABOUT, { delay: 40 }); await shot('what');
  if (!(await press(/^המשך$/))) throw new Error('could not continue from "what"');
  await p.getByLabel('שם מלא').fill(NAME); await press(/^עוסק פטור$/); await p.getByLabel('עיר הבסיס').fill('חיפה'); await shot('details'); await press(/^המשך$/);
  await shot('docs'); if (!(await press(/^דלג לעכשיו/))) throw new Error('no docs skip');
  await shot('prices'); if (!(await press(/^המשך$/))) throw new Error('prices blocked');
  await shot('shop'); await press(/^המשך$/);
  await shot('photo'); if (!(await press(/^דלג לעכשיו/))) await press(/^המשך$/);
  await shot('summary'); await press(/^שליחה לאישור/); await p.waitForTimeout(3500); await shot('sent');
  await press(/אישור החשבון/); await p.waitForTimeout(2500); await shot('shop_open');
  await press(/^להתחיל משמרת/); await p.waitForTimeout(1500); await press(/^סגירה$|^הבנתי/); await shot('shift');
  await press(/^התחלת משמרת/); await p.waitForTimeout(1000); await shot('online');
  await press(/קריאה לדוגמה/); await p.waitForTimeout(1500); await shot('offer');
  await press(/^(קבלת העבודה|לקבל|קבל|אישור)/); await p.waitForTimeout(2000); await shot('job');
  await p.waitForTimeout(3000); await shot('job_later');
  console.log('OK', errs.join(' | '));
} catch (e) { console.log('FAIL', String(e).slice(0, 300), errs.join(' | ')); await shot('fail'); }
fs.writeFileSync(`out/${TAG}_texts.txt`, log.join('\n')); await b.close();
