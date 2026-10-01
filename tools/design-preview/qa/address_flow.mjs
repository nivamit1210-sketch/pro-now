// Dvir, 2026-10-02: while ordering, the order's address must show and be changeable;
// a saved address must be removable. Run: node qa/address_flow.mjs
process.env.PW_CHROMIUM ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
import { open } from './audit_customer_lib.mjs';
import { setAddress } from './address.mjs';
const A = await open('addrflow'); const { p, press } = A;
let fails = 0; const check = (n, ok, x = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
try {
  await A.toHome(); // types "דיזנגוף 50, תל אביב · קומה 2"
  await setAddress(p, press, { typed: 'אהרון דוד גורדון 18, תל אביב', forName: 'דורון' });
  await press(/^תיקונים בבית$/); await press(/^הפסקת חשמל/); await p.waitForTimeout(800);
  check('service page shows where the order goes', (await A.has('לאן')) && (await A.has('אהרון דוד גורדון 18')) && (await A.has('עבור דורון')), (await A.sig()).slice(0, 140));
  await p.getByLabel(/^ההזמנה לכתובת/).first().click(); await p.waitForTimeout(800);
  check('"שינוי" opens the address picker', await A.has('אישור הכתובת'));
  await press(/^דיזנגוף 50/) || await p.getByRole('radio').first().click();
  await p.waitForTimeout(300);
  await press(/^אישור הכתובת/); await p.waitForTimeout(800);
  check('back on the service page with the new address', (await A.has('לאן')) && (await A.has('דיזנגוף 50')) && !(await A.has('עבור דורון')), (await A.sig()).slice(0, 140));
  await press(/^בקשת .* עכשיו$/); await p.waitForTimeout(800);
  check('describe screen shows the address too', (await A.has('לאן')) && (await A.has('דיזנגוף 50')));
  await p.getByLabel(/^ההזמנה לכתובת/).first().click(); await p.waitForTimeout(800);
  const before = await p.getByLabel(/^הסרת הכתובת/).count();
  await p.getByLabel(/^הסרת הכתובת/).last().click(); await p.waitForTimeout(500);
  const after = await p.getByLabel(/^הסרת הכתובת/).count();
  check('a saved address can be removed', before >= 2 && after === before - 1, `before=${before} after=${after}`);
  check('no "אצל דורון · עבור דורון"', !(await A.has('אצל דורון · עבור דורון')));
} catch (e) { fails++; console.log('FAIL threw', String(e).slice(0, 200)); }
await p.screenshot({ path: 'out/addrflow_end.png' });
console.log(fails ? `${fails} FAIL` : 'ALL PASS', A.errs.slice(0, 2));
await A.b.close();
