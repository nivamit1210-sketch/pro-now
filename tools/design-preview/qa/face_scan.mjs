// The face step after the ID card: the model loads, the camera (live, or the phone's selfie camera)
// opens, a real face is required at each step. Run: node qa/face_scan.mjs   (env FAKE_CAM=1 for a live fake camera)
process.env.PW_CHROMIUM ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
import { launchChromium } from '../browser.mjs';
const live = Boolean(process.env.FAKE_CAM);
const b = await launchChromium(live ? { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } : {});
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
const FILE = new URL('../public/world/avatar_01_portrait.webp', import.meta.url).pathname;
p.on('filechooser', async (fc) => { await fc.setFiles(FILE).catch(() => {}); });
const press = async (re) => { const loc = p.locator('[role=button],button,[role=radio]').filter({ visible: true }); const c = await loc.count(); for (let i = 0; i < c; i++) { const el = loc.nth(i); const a = ((await el.getAttribute('aria-label')) || '').trim(); const t = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' '); const lab = re.test(a) ? a : t; if (re.test(lab)) { await el.click({ force: true }); await p.waitForTimeout(700); return lab; } } return null; };
const txt = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
let fails = 0; const check = (n, ok, x = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
await p.goto(process.env.URL0 || 'http://127.0.0.1:4421/?time=night'); await p.locator('text=אני בעל מקצוע').first().waitFor();
await press(/^אני בעל מקצוע/); await p.getByLabel('מספר טלפון').fill('0547779876'); await press(/^שליחת קוד/); await p.getByLabel('קוד האימות').fill('123456'); await press(/^כניסה/);
await press(/^דילוג על ההסבר/); await press(/^מתחילים$/);
await p.getByLabel('תיאור חופשי של העבודה שלך').pressSequentially('נגר', { delay: 30 }); await p.waitForTimeout(800); await press(/^הוספה$/); await press(/^המשך$/);
await p.getByLabel('שם מלא').fill('רון לוי'); await press(/^עוסק פטור$/); await p.getByLabel('עיר הבסיס').fill('חיפה'); await p.waitForTimeout(600); await press(/^המשך$/);
for (let i = 0; i < 3 && /פרטים ואזור/.test(await txt()); i++) { await p.waitForTimeout(500); await p.screenshot({ path: 'out/face_0_details.png' }); console.log('  still on details; buttons:', (await p.locator('[role=button],button').filter({ visible: true }).allInnerTexts()).slice(-4).join(' | ')); await press(/^המשך$/); }
await press(/^צילום התעודה$/);
for (let i = 0; i < 20 && !(await txt()).includes('פתיחת המצלמה'); i++) await p.waitForTimeout(400);
await press(/^פתיחת המצלמה$/);
for (let i = 0; i < 30 && /מכינים את הסריקה/.test(await txt()); i++) await p.waitForTimeout(300);
await p.waitForTimeout(1500);
await p.screenshot({ path: 'out/face_1_open.png' });
const t = await txt();
if (live) {
  check('live camera opens and the face is being read', /לא רואים פנים|התקרבו|מביטים ישר/.test(t), t.slice(0, 160));
} else {
  check('no live camera here → the selfie camera, one picture per step', /צילום — מביטים ישר/.test(t), t.slice(0, 160));
  await press(/^צילום — מביטים ישר/); await p.waitForTimeout(2500);
  await p.screenshot({ path: 'out/face_2_straight.png' });
  check('a real face, looking straight → first check passes', /ראש ימינה/.test(await txt()), (await txt()).slice(0, 160));
  await press(/^צילום — ראש ימינה/); await p.waitForTimeout(2500);
  await p.screenshot({ path: 'out/face_3_not_turned.png' });
  check('the same straight face for "right" is refused', /סובבו את הראש עוד קצת ימינה/.test(await txt()), (await txt()).slice(0, 160));
}
check('no errors', errs.length === 0, errs.join(' | '));
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
await b.close();
