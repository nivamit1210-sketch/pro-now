// Amit, 2026-10-01: in the pet shop, a service, then back — "זה עשה כאילו טוען את כל העיר מחדש".
// For every shop: open its services, open the first one, go back (the screen's own back, then the
// phone's back), and the same through the describe screen. Back must land in the same shop with
// no loading screen ("נכנסים לעיר"), no veil, and the same WebGL canvas.
// Run: URL0='http://127.0.0.1:4421/?time=night' node qa/city_qa_service.mjs [shopId,...]
import { open, SHOPS } from './city_qa_lib.mjs';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const list = only ? SHOPS.filter((s) => only.includes(s.id)) : SHOPS;
const A = await open('svc' + (only ? '_' + only.join('_') : ''));
const { p } = A;
let fails = 0;
const check = (shop, name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${shop.padEnd(9)} ${name}${extra ? '  — ' + extra : ''}`); };
const svcBtns = async () => (await A.buttons()).filter((b) => /›$/.test(b) && !/^מה אפשר|^חזרה/.test(b));
// After a back: 2.5 s of samples — loading screen, veil, which shop.
const afterBack = async () => {
  const t = []; let load = false; let veil = 0;
  for (let i = 0; i < 25; i++) { await p.waitForTimeout(100); const tx = await A.text(); if (tx.includes('נכנסים לעיר')) load = true; const v = await A.veilNow(); if (v > veil) veil = v; if (i % 5 === 0) t.push(v); }
  return { load, veil, sameCanvas: await A.rewatch(), canvases: await p.evaluate(() => document.querySelectorAll('canvas').length) };
};
// Where are we: in the shop (pill), in its menu (services listed), or elsewhere.
const where = async (shop) => {
  const pill = await A.pill(); const b = await A.buttons();
  if (pill.some((x) => x.startsWith(shop.he) && x.includes('אתם בפנים'))) return 'shop';
  if (b.includes('חזרה לרחוב') && (await A.cityState())?.room === shop.id) return 'menu';
  return `elsewhere: ${(await A.sig()).slice(0, 70)} pill=${JSON.stringify(pill)}`;
};
const openService = async (shop) => {
  if ((await where(shop)) === 'shop') { await A.press(/^מה אפשר להזמין כאן/); await p.waitForTimeout(1300); }
  const s = await svcBtns(); if (!s.length) return null;
  const lab = await A.pressTop(new RegExp('^' + s[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
  await p.waitForTimeout(1500);
  return lab;
};
try {
  await A.toHome(); await A.press(/טיול ברחוב/); console.log('ready', await A.cityReady()); await A.watch();
  for (const shop of list) {
    const e0 = A.errs.length;
    const lab = await A.enterShop(shop);
    if (!lab || !(await A.inside())) { check(shop.id, 'enter', false, String(lab)); await A.snap(`${shop.id}_enter_fail`); continue; }
    await A.press(/^מה אפשר להזמין כאן/); await p.waitForTimeout(1300);
    const menu = await svcBtns();
    check(shop.id, 'menu lists services', menu.length > 0, JSON.stringify(menu));
    await A.snap(`${shop.id}_menu`);
    if (!menu.length) { await A.press(/^חזרה לרחוב$/); await p.waitForTimeout(2500); continue; }

    // Each case starts inside the shop; a back that lands anywhere else is written down as it is.
    const onSvcPage = async () => (await A.buttons()).some((b) => /^בקשת .* עכשיו$/.test(b)) && (await A.cityState())?.pausedRef === true;
    const ensureIn = async () => {
      for (let i = 0; i < 5 && (await A.cityState())?.pausedRef !== false; i++) await A.pressTop(/^חזרה$/);
      if ((await A.cityState())?.pausedRef !== false) return false;
      const w = await where(shop); if (w === 'shop' || w === 'menu') return true;
      const lab = await A.enterShop(shop); const w2 = await where(shop);
      if (w2 !== 'shop') console.log('   ensureIn:', lab, w2, JSON.stringify(await A.cityState()), JSON.stringify(await A.buttons()));
      return w2 === 'shop';
    };
    const backCase = async (title, toDescribe, doBack) => {
      if (!(await ensureIn())) { check(shop.id, title, false, 'could not get back inside the shop to start'); return; }
      const svc = await openService(shop);
      if (!svc || !(await onSvcPage())) { check(shop.id, title, false, `service did not open: ${svc} ${(await A.sig()).slice(0, 80)}`); return; }
      let steps = [];
      if (toDescribe) {
        const req = await A.pressTop(/^בקשת .* עכשיו$/); await p.waitForTimeout(1500);
        steps.push(`describe: "${(await A.sig()).slice(0, 60)}"`);
        await A.snap(`${shop.id}_${toDescribe}`);
        await A.rewatch(); await doBack(); await p.waitForTimeout(600);
        const onDescribe = await p.evaluate(() => [...document.querySelectorAll('[role=button],button')].some((e) => { const l = (e.getAttribute('aria-label') || e.innerText || ''); if (!/^שליחת הקריאה/.test(l.trim())) return false; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(t && (e === t || e.contains(t))); }));
        const st0 = await A.cityState();
        steps.push(`back#0 → ${(await onSvcPage()) ? 'service' : onDescribe ? 'STILL ON DESCRIBE' : (await A.sig()).slice(0, 50)}; city behind: inside=${st0?.insideShop} room=${st0?.room}`);
        await A.snap(`${shop.id}_${toDescribe}_back0`);
      }
      await A.rewatch();
      const insideBefore = await where(shop);
      await doBack();
      const r1 = await afterBack();
      const stillSvc = await onSvcPage();
      const st1 = await A.cityState();
      const w1 = stillSvc ? `still on the service page; city behind: inside=${st1?.insideShop} room=${st1?.room} near=${st1?.nearId}` : await where(shop);
      steps.push(`back#1 → ${w1} load=${r1.load} veil=${r1.veil} sameCanvas=${r1.sameCanvas}`);
      await A.snap(`${shop.id}_${title.replace(/\W+/g, '_')}_1`);
      if (stillSvc) {
        await doBack(); const r2 = await afterBack(); const w2 = (await onSvcPage()) ? 'still service' : await where(shop);
        steps.push(`back#2 → ${w2} load=${r2.load} veil=${r2.veil} sameCanvas=${r2.sameCanvas}`);
        await A.snap(`${shop.id}_${title.replace(/\W+/g, '_')}_2`);
      }
      const ok = !stillSvc && (w1 === 'shop' || w1 === 'menu') && !r1.load && r1.sameCanvas && r1.veil < 0.05;
      check(shop.id, title, ok, `(before: ${insideBefore}) ` + steps.join(' | '));
    };
    await backCase('service → screen back → same shop', null, () => A.pressTop(/^חזרה$/));
    await backCase('service → phone back → same shop', null, () => A.histBack());
    await backCase('describe → screen back ×2 → same shop', 'describe', () => A.pressTop(/^חזרה$/));
    await backCase('describe → phone back ×2 → same shop', 'describe2', () => A.histBack());

    if (A.errs.length > e0) check(shop.id, 'console', false, A.errs.slice(e0).join(' ; '));
    // on to the next shop: close the menu, walk out
    if ((await where(shop)) === 'menu') await A.pressTop(/^חזרה לרחוב$/); else await A.press(/חזרה לרחוב/);
    await A.waitFor(async () => !(await A.inside()), 5000); await p.waitForTimeout(2300);
    if (await A.inside()) { check(shop.id, 'leave after the services', false, JSON.stringify(await A.pill())); await A.press(/חזרה לרחוב/); await p.waitForTimeout(2500); }
  }
} catch (e) { fails++; console.log('THREW', String(e).slice(0, 300)); await A.snap('threw'); }
console.log('errs', JSON.stringify(A.errs));
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
await A.b.close();
