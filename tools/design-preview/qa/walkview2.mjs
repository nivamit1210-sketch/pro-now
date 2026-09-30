// On a phone, the shop the pill names vs the shop filling the screen — every few steps.
import { launchChromium } from '../browser.mjs';
const [x0, z0, dir] = (process.env.FROM ?? '-4.5,96,-1').split(',').map(Number);
const b = await launchChromium();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await p.goto(`http://127.0.0.1:4421/?city=1&time=day&x=${x0}&z=${z0}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(7000);
const stick = (x, y) => p.evaluate(([x, y]) => { for (const el of document.querySelectorAll('div')) if (el.__stick) { el.__stick(x, y); return true; } return false; }, [x, y]);
if (dir > 0) { await stick(0, 0.6); await p.waitForTimeout(900); }
for (let i = 0; i < 40; i++) {
  await stick(0, -0.6); await p.waitForTimeout(300); await stick(0, 0); await p.waitForTimeout(250);
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 40);
  await p.screenshot({ path: `out/wv/${String(i).padStart(3, '0')}.png` }); console.log(i, t);
}
await b.close();
