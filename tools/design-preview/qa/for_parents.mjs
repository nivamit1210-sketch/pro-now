import { launchChromium } from '../browser.mjs';
import { setAddress } from './address.mjs';
const b = await launchChromium({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
const pressRaw = async (re) => { const loc = p.locator('[role=button],button').filter({ visible: true }); const c = await loc.count(); for (let i = 0; i < c; i++) { const el = loc.nth(i); const a = ((await el.getAttribute('aria-label')) || '').trim(); const t = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' '); const lab = re.test(a) ? a : t; if (re.test(lab)) { await el.click({ force: true }); await p.waitForTimeout(1300); return lab; } } return null; };
/* __toPro: the side switch left the header (2026-09-29) — the demo bar, else the menu. */
const press = async (re) => {
  if (re.source !== '^מקצוען$') return pressRaw(re);
  const viaBar = await pressRaw(/^הדגמה: (הצצה לצד המקצוען|מעבר לצד המקצוען)/); if (viaBar) return 'מקצוען';
  if (await pressRaw(/^תפריט$/)) { const r = await pressRaw(/^הצצה לצד המקצוען/); if (r) return 'מקצוען'; }
  return pressRaw(re);
};
const txt = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const step = async (re, name) => { const r = await press(re); console.log((r ? '✓ ' : '✗ ') + name + (r ? '' : ' :: ' + (await txt()).slice(0, 200))); return r; };
// Amit, 2026-10-01: ordered for the parents, a repair is quoted IN THE APP to whoever ordered —
// with photos — approved and paid there; the page at home says "עמית אישר ושילם".
const FILE = new URL(process.env.PHOTO || '../public/world/avatar_01_portrait.webp', import.meta.url).pathname;
p.on('filechooser', async (fc) => { await fc.setFiles(FILE).catch(() => {}); });
let fails = 0; const check = (name, ok) => { if (!ok) fails++; console.log((ok ? 'PASS  ' : 'FAIL  ') + name); };
const shot = (n) => p.screenshot({ path: `out/fp_${n}.png` });
await p.goto(process.env.URL0 || 'http://127.0.0.1:4421/?time=night'); await p.locator('text=אני צריך מקצוען').first().waitFor();
await press(/^אני צריך מקצוען/); await p.getByLabel('מספר טלפון').fill('0501234567'); await press(/^שליחת קוד/); await p.getByLabel('קוד האימות').fill('123456'); await press(/^כניסה/);
await press(/^דילוג על ההסבר/); await press(/^דמות 1$/); await press(/^(אישור הדמות|זו אני)/);
await setAddress(p, press, { forName: 'סבא יוסף' }); console.log('✓ address for grandpa');
await step(/^תיקונים בבית/, 'category'); await step(/^נזילה/, 'service');
{ const t = await txt(); check('service page: the quote comes to me, nothing settled at their door', /רק אצלך מאשרים ומשלמים/.test(t) && !/ישירות/.test(t)); if (/ישירות/.test(t)) console.log('   …', t.slice(Math.max(0, t.indexOf('ישירות') - 120), t.indexOf('ישירות') + 30)); if (!/רק אצלך/.test(t)) console.log('   page:', t.slice(0, 300)); }
await step(/^בקשת בעל מקצוע עכשיו/, 'request');
check('describe page: nothing "settled directly"', !/ישירות/.test(await txt()));
await step(/^שליחת הקריאה/, 'send');
await p.locator('text=/כן, מתאים לי/').first().waitFor({ timeout: 25000 }).catch(() => {}); await p.waitForTimeout(1200);
check('match says the quote will come to me', /הצעת מחיר אליך לאישור/.test(await txt()) && !/ישירות/.test(await txt()));
await step(/^(כן, מתאים לי|זה מתאים|אישור)/, 'accept'); await p.waitForTimeout(6500);
await step(/^מקצוען$/, '→ pro'); await step(/^כן, אני לוקח/, 'pro takes');
await step(/^(יוצא|יציאה) לדרך/, 'leaves'); await step(/^הגעתי/, 'arrives');
check('pro is NOT told to settle at the door', !(await press(/^סיימתי את (האבחון|הבדיקה)/)));
check('pro band says quote goes to the orderer', /שולחים הצעת מחיר לעמית|הוזמנה על ידי עמית/.test(await txt()));
await shot('1_pro_diag');
await step(/^שליחת הצעת מחיר/, 'open quote form');
check('builder says it goes to the orderer', /ההצעה נשלחת לעמית/.test(await txt()));
const desc = p.getByPlaceholder(/מה נעשה/); if (await desc.count()) await desc.first().fill('החלפת סיפון מתחת לכיור');
const price = p.locator('input').nth(2); if (await price.count()) { const v = await price.inputValue().catch(() => ''); if (!v || v === '0') await price.fill('380'); }
check('cannot send without a photo and words', /חסר: תמונה של התקלה/.test(await txt()));
await step(/^\+ צילום התקלה/, 'photo of the fault'); await p.waitForTimeout(800);
if (await press(/^הקלטה: מה מצאתי/)) { await p.waitForTimeout(3200); await press(/^● מקליט/); await p.waitForTimeout(800); }
await p.getByLabel('מה מצאת, במילים').fill('הסיפון מתחת לכיור סדוק ודולף לארון. צריך להחליף אותו, אחרת הארון יירקב.');
await shot('2_builder');
await step(/^שליחה לעמית לאישור/, 'send to orderer');
check('pro waits for the orderer', /ממתינים לאישור של עמית/.test(await txt()));
await step(/^לקוח$/, '→ customer'); await p.waitForTimeout(2000);
check('the quote opens by itself for whoever ordered', /אישור ההצעה/.test(await txt()));
check('nothing on the orderer\'s screens says "settled directly"', !/ישירות/.test(await txt()));
check('quote screen: only you approve', /רק אצלך מאשרים ומשלמים/.test(await txt()));
check('quote screen shows the photo', (await p.getByLabel('תמונה של התקלה').count()) > 0);
check('quote screen: what was found, in words', /מה נמצא בבדיקה/.test(await txt()) && /הסיפון מתחת לכיור סדוק/.test(await txt()));
check('quote screen: what the price buys', /מה כלול במחיר/.test(await txt()) && /החלפת סיפון מתחת לכיור/.test(await txt()));
await shot('3_orderer_quote');
await step(/^חזרה$/, 'leave the quote (not a decline)'); await p.waitForTimeout(1200);
await step(/מה סבא .*רואה/, 'open grandpa page (quote sent)'); await p.waitForTimeout(800);
check('grandpa SMS carries the door code', /הקוד לדלת: 4821/.test(await txt()));
check('grandpa has no approval SMS yet', !/אישר ושילם/.test(await txt()));
await shot('4_grandpa_sent');
await step(/^חזרה/, 'back to tracking'); await p.waitForTimeout(800);
if (!/אישור ההצעה/.test(await txt())) { const cap = p.locator('[role=button],button').filter({ hasText: 'הצעת מחיר ממתינה' }); if (await cap.count()) await cap.first().click(); else await press(/הצעת מחיר/); await p.waitForTimeout(1500); }
await step(/^אישור ההצעה/, 'orderer approves'); await p.waitForTimeout(1500);
await step(/מה סבא .*רואה/, 'open grandpa page (approved)'); await p.waitForTimeout(800);
check('grandpa: an SMS says עמית approved and paid', /עמית אישר ושילם/.test(await txt()) && /אין צורך לשלם ליוסי כלום/.test(await txt()));
await shot('5_grandpa_paid');
console.log(fails ? `${fails} FAIL` : 'ALL PASS', errs.length ? 'ERR ' + errs[0] : '');
await b.close();
