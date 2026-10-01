// A professional who skipped the identity check can still open a shift for showing the app (Amit, 2026-10-01).
process.env.PW_CHROMIUM ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
import { open } from './audit_customer_lib.mjs';
const A = await open('dshift'); const { p, press } = A;
let fails = 0; const check = (n, ok, x = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
await p.goto(process.env.URL0 || 'http://127.0.0.1:4421/?time=night'); await p.locator('text=אני בעל מקצוע').first().waitFor();
await press(/^אני בעל מקצוע/); await p.getByLabel('מספר טלפון').fill('0547771234'); await press(/^שליחת קוד/); await p.getByLabel('קוד האימות').fill('123456'); await press(/^כניסה/);
await press(/^דילוג על ההסבר/); await press(/^מתחילים$/);
await p.getByLabel('תיאור חופשי של העבודה שלך').pressSequentially('נגר', { delay: 30 }); await p.waitForTimeout(800); await press(/^הוספה$/); await press(/^המשך$/);
await p.getByLabel('שם מלא').fill('רון לוי'); await press(/^עוסק פטור$/); await p.getByLabel('עיר הבסיס').fill('חיפה'); await press(/^המשך$/);
await press(/^אחר כך$/); for (const el of await p.getByLabel(/^מחיר/).all()) { if (await el.isVisible().catch(() => false)) await el.fill('150'); }
await press(/^המשך$/); await press(/^אעצב אחר כך$/); (await press(/^אחר כך$/)) || (await press(/^המשך$/));
await press(/^שליחה לאישור/); await p.waitForTimeout(2500);
check('not approved without the check', await A.has('השלמת הרישום'));
await press(/^כניסה לאפליקציה בינתיים/); await p.waitForTimeout(2000);
check('shift is locked, with the demo way in', (await A.has('עוד לא מאושר לעבודה')) && (await A.has('התחלת משמרת להדגמה')));
await press(/^התחלת משמרת להדגמה/); await p.waitForTimeout(2500);
check('demo shift opens', await A.has('סיום משמרת'), (await A.sig()).slice(0, 120));
await p.screenshot({ path: 'out/demo_shift.png' });
console.log(fails ? `${fails} FAIL` : 'ALL PASS', A.errs.slice(0, 2));
await A.b.close();
