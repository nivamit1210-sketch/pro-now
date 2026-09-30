// A new professional joins: every step of ProOnboardingBody, photographed.
import { launchChromium } from '../browser.mjs';
const b = await launchChromium();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
const TAG = process.env.TAG || 'ob';
let n = 0; const texts = []; const shot = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: `out/${TAG}_${String(++n).padStart(2, '0')}_${name}.png`, fullPage: false }); texts.push(`--- ${name}\n` + (await p.evaluate(() => document.body.innerText)).slice(0, 1500)); };
const press = async (re) => { const loc = p.locator('[role=button],button,[role=radio],[role=checkbox]').filter({ visible: true }); const c = await loc.count(); for (let i = 0; i < c; i++) { const el = loc.nth(i); const a = ((await el.getAttribute('aria-label')) || '').trim(); const t = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' '); const lab = re.test(a) ? a : t; if (re.test(lab)) { await el.evaluate((n) => n.scrollIntoView({ block: 'center' })); await p.waitForTimeout(150); await el.click({ force: true }); await p.waitForTimeout(700); return lab; } } return null; };
const LOGO = process.env.LOGO || '../public/world/avatar_01_portrait.webp';
p.on('filechooser', async (fc) => { await fc.setFiles(LOGO); });
try {
  // As Amit did: "אני בעל מקצוע" on the welcome, a new phone, through the explanation.
  await p.goto('http://127.0.0.1:4421/?time=day'); await p.locator('text=אני בעל מקצוע').first().waitFor();
  await press(/^אני בעל מקצוע/); await p.getByLabel('מספר טלפון').fill('0541112233'); await press(/^שליחת קוד/); await p.getByLabel('קוד האימות').fill('123456'); await press(/^כניסה/);
  for (let k = 0; k < 4; k++) await press(/^הבא$/); await press(/^בואו נתחיל|^בוא נתחיל/);
  await shot('welcome');
  await press(/^בוא נתחיל/);
  await p.getByLabel('תיאור חופשי של העבודה שלך').fill(process.env.ABOUT || 'אני חשמלאי, מתקין שקעים וגופי תאורה, מתקן קצרים ועושה גם אזעקות ומצלמות');
  await p.waitForTimeout(900); await shot('what');
  await p.getByLabel('שירות נוסף שלא ברשימה').fill('התקנת עמדות טעינה לרכב חשמלי'); await press(/^הוספה$/); await shot('what_custom');
  await press(/^המשך$/);
  await p.getByLabel('שם מלא').fill('רון לוי'); await p.getByLabel('שם העסק').fill('רון חשמל'); await press(/^עוסק מורשה$/); await p.getByLabel('עיר הבסיס').fill('רמת גן'); await press(/^25 ק״מ$/);
  await shot('details'); await press(/^המשך$/);
  await shot('docs');
  for (let k = 0; k < 8; k++) { if (!(await press(/^העלאת /))) break; await p.waitForTimeout(500); }
  const lic = p.getByLabel(/רישיון חשמלאי — מספר רישיון/); if (await lic.count()) await lic.first().fill('123456');
  await shot('docs_done'); await press(/^המשך$/);
  await shot('prices'); await press(/^המשך$/);
  await press(/^העלאת לוגו/); await p.waitForTimeout(1200); await shot('shop'); await press(/^המשך$/);
  await press(/^הדמות של המקצוע/); await shot('photo'); await press(/^המשך$/);
  await shot('summary'); await press(/^שליחה לאישור/);
  await p.waitForTimeout(4500); await shot('sent');
  await press(/אישור החשבון/); await p.waitForTimeout(2600); await shot('shop_open');
  await press(/^להתחיל משמרת/); await p.waitForTimeout(1500); await shot('approved');
  console.log('OK', errs.join(' | '));
} catch (e) { console.log('FAIL', String(e).slice(0, 300), errs.join(' | ')); await shot('fail'); }
(await import('node:fs')).writeFileSync(`out/${TAG}_texts.txt`, texts.join('\n')); await b.close();
