// Walk the street on a phone from the start, as a person does, and photograph
// the screen every time the pill names a new shop — is that shop on screen?
import { launchChromium } from '../browser.mjs';
const b = await launchChromium();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await p.goto(`http://127.0.0.1:4421/?city=1&time=day&x=4.5&z=96`, { waitUntil: 'networkidle' });
await p.waitForTimeout(7000);
const stick = (x, y) => p.evaluate(([x, y]) => { for (const el of document.querySelectorAll('div')) if (el.__stick) { el.__stick(x, y); return true; } return false; }, [x, y]);
let last = '';
for (let i = 0; i < 160; i++) {
  await stick(0, -0.6); await p.waitForTimeout(250);
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 60);
  if (t !== last) { last = t; await stick(0, 0); await p.waitForTimeout(400); await p.screenshot({ path: `out/wv/${String(i).padStart(3, '0')}.png` }); console.log(i, t); }
}
await b.close();
