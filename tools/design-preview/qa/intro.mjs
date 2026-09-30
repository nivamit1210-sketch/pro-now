// Every explanation slide, customer and professional, on a phone: the words and the picture behind them.
import { launchChromium } from '../browser.mjs';
const b = await launchChromium();
for (const [side, btn] of [['customer', /^אני לקוח|^אני צריך|^לקוח/], ['pro', /^אני בעל מקצוע/]]) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const press = async (re) => { const loc = p.locator('[role=button],button').filter({ visible: true }); const c = await loc.count(); for (let i = 0; i < c; i++) { const el = loc.nth(i); const a = ((await el.getAttribute('aria-label')) || '').trim(); const t = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' '); const lab = re.test(a) ? a : t; if (re.test(lab)) { await el.click({ force: true }); await p.waitForTimeout(900); return lab; } } return null; };
  await p.goto('http://127.0.0.1:4421/?time=night'); await p.locator('text=אני בעל מקצוע').first().waitFor();
  console.log(side, 'entry:', await press(btn));
  await p.getByLabel('מספר טלפון').fill(side === 'pro' ? '0501234567' : '0521234567'); await press(/^שליחת קוד/); await p.getByLabel('קוד האימות').fill('123456'); await press(/^כניסה/);
  for (let i = 0; i < 6; i++) {
    await p.waitForTimeout(1800);
    await p.screenshot({ path: `out/intro/${side}_${i}.png` });
    const title = await p.evaluate(() => document.body.innerText.split('\n').filter(Boolean).slice(0, 4).join(' | '));
    console.log(side, i, title.slice(0, 110));
    if (!(await press(/^הבא|^המשך/))) break;
  }
  await p.close();
}
await b.close();
