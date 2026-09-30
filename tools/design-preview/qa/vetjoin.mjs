// Amit's case: a vet types his trade, key by key, on a phone.
import { launchChromium } from '../browser.mjs';
const b = await launchChromium();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const press = async (re) => { const loc = p.locator('[role=button],button').filter({ visible: true }); const c = await loc.count(); for (let i = 0; i < c; i++) { const el = loc.nth(i); const a = ((await el.getAttribute('aria-label')) || '').trim(); const t = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' '); const lab = re.test(a) ? a : t; if (re.test(lab)) { await el.click({ force: true }); await p.waitForTimeout(700); return lab; } } return null; };
await p.goto('http://127.0.0.1:4421/?time=day'); await p.locator('text=אני בעל מקצוע').first().waitFor();
await press(/^אני בעל מקצוע/); await p.getByLabel('מספר טלפון').fill('0549998877'); await press(/^שליחת קוד/); await p.getByLabel('קוד האימות').fill('123456'); await press(/^כניסה/);
for (let k = 0; k < 4; k++) await press(/^הבא$/); await press(/^בואו נתחיל|^בוא נתחיל/); await press(/^בוא נתחיל/);
const box = p.getByLabel('תיאור חופשי של העבודה שלך');
for (const text of (process.env.TYPE || 'חנות חיות|וטרינר').split('|')) {
  await box.fill(''); await box.pressSequentially(text, { delay: 60 }); await p.waitForTimeout(800);
  const picked = await p.evaluate(() => [...document.querySelectorAll('[aria-checked="true"],[aria-selected="true"]')].map((e) => e.textContent.trim()).join(' / '));
  console.log(JSON.stringify(text), '=> ticked:', picked.slice(0, 200));
  await p.screenshot({ path: `out/vet_${text.replace(/\s/g, '_')}.png` });
}
await b.close();
