// Shared helpers for the street QA (qa/city_qa*.mjs), 2026-10-01.
// Built on audit_customer_lib.mjs; screenshots go to out/qa_city/.
process.env.PW_CHROMIUM ||= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Run with URL0='http://127.0.0.1:4421/?time=night' (ES imports are hoisted, so it cannot be set here).
import fs from 'node:fs';
import { open as openBase } from './audit_customer_lib.mjs';

export const OUT = 'out/qa_city';
fs.mkdirSync(OUT, { recursive: true });

// The roster in src/city/City.tsx:75-105 (id, Hebrew name, z, side).
export const SHOPS = [
  ['hair', 'טיפוח ויופי', 88, -1], ['pets', 'בעלי חיים', 70.4, 1], ['home', 'תיקונים דחופים', 52.8, -1],
  ['lust', 'Lust', 35.2, 1], ['tech', 'מחשבים וסלולר', 17.6, -1], ['auto', 'רכב ודרך', 0, 1],
  ['well', 'בריאות וכושר', -17.6, -1], ['appliance', 'מוצרי חשמל', -35.2, 1], ['care', 'ניקיון ותחזוקה', -52.8, -1],
  ['nails', 'ציפורניים', -70.4, 1], ['move', 'הובלות ומשלוחים', -88, -1], ['vet', 'וטרינריה', -105.6, 1],
  ['build', 'שיפוץ והתקנות', -123.2, -1], ['help', 'עזרה ועבודות קטנות', -140.8, 1],
].map(([id, he, z, side]) => ({ id, he, z, side, doorX: side * (9.7 - 3.0) }));

export async function open(tag) {
  const A = await openBase(tag);
  const { p } = A;
  let n = 0;
  // A race-free `buttons()`: one read of the DOM (the base helper can time out when a button
  // leaves the screen between counting and reading).
  A.buttons = () => p.evaluate(() => [...document.querySelectorAll('[role=button],button,[role=checkbox],[role=radio],[role=link],a[href],[role=tab],[role=switch],[role=menuitem]')]
    .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; })
    .map((e) => ((e.getAttribute('aria-label') || '').trim() || (e.innerText || '').trim().replace(/\s+/g, ' '))));
  A.snap = async (name) => { await p.waitForTimeout(300); const f = `${OUT}/${tag}_${String(++n).padStart(2, '0')}_${name}.png`; await p.screenshot({ path: f }); return f; };
  A.stick = (x, y) => p.evaluate(([x, y]) => { for (const el of document.querySelectorAll('div')) if (el.__stick) { el.__stick(x, y); return true; } return false; }, [x, y]);
  A.teleport = (x, z) => p.evaluate(([x, z]) => { const f = window.__pnTeleport; if (!f) return false; f(x, z); return true; }, [x, z]);
  // Watches the page for the city's loading screen ("נכנסים לעיר") and for the canvas being replaced.
  A.watch = () => p.evaluate(() => {
    const w = (window.__qaW = { loads: 0, maxVeil: 0, sawLoad: false });
    const c = document.querySelector('canvas'); if (c) c.__qaMark = 1;
    const tick = () => {
      if (document.body.innerText.includes('נכנסים לעיר')) { if (!w.sawLoad) w.loads++; w.sawLoad = true; } else w.sawLoad = false;
      const v = [...document.querySelectorAll('div')].find((d) => (d.style.transition || '').includes('opacity 460ms'));
      if (v) { const o = Number(v.style.opacity || 0); if (o > w.maxVeil) w.maxVeil = o; }
      w.raf = requestAnimationFrame(tick);
    };
    tick();
    return true;
  });
  A.watched = () => p.evaluate(() => { const c = document.querySelector('canvas'); const w = window.__qaW || {}; return { loads: w.loads, maxVeil: w.maxVeil, sameCanvas: Boolean(c && c.__qaMark), canvases: document.querySelectorAll('canvas').length }; });
  A.pill = async () => p.evaluate(() => { const out = []; for (const d of document.querySelectorAll('div')) { const t = (d.innerText || '').trim(); if (/אתם בפנים|כדאי להיכנס|נפגשים כאן|בחסות/.test(t) && t.length < 60 && d.children.length <= 4) out.push(t.replace(/\s+/g, ' ')); } return [...new Set(out)]; });
  A.cityReady = async (ms = 40000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const ok = await p.evaluate(() => Boolean(window.__pnTeleport) && !document.body.innerText.includes('נכנסים לעיר')); if (ok) return Date.now() - t0; await p.waitForTimeout(500); } return -1; };
  A.inside = async () => (await A.text()).includes('אתם בפנים');
  A.hasBtn = async (re) => (await A.buttons()).some((b) => re.test(b));
  A.waitFor = async (fn, ms = 8000, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return Date.now() - t0; await p.waitForTimeout(step); } return -1; };
  // Turn round: pull the stick down (City.tsx:1680-1686, a half-turn on the street).
  A.spin = async () => { await A.stick(0, -0.1); await p.waitForTimeout(300); await A.stick(0, 1); await p.waitForTimeout(1100); await A.stick(0, 0); await p.waitForTimeout(400); };
  // Stand a metre up the street from a shop's door and press "כניסה ל…". If no door button
  // shows (the figure faces up the street, +z), turn round once and try again; `A.lastSpun` says so.
  A.enterShop = async (shop) => {
    A.lastSpun = false;
    const stand = async () => { await A.teleport(shop.doorX, shop.z + 1.0); return A.waitFor(async () => (await A.buttons()).some((b) => /^כניסה ל/.test(b)), 4000); };
    await A.stick(0, -0.2); await p.waitForTimeout(250); await A.stick(0, 0); // a step: brings the camera down from the air
    let ok = await stand();
    for (let i = 0; i < 2 && ok < 0; i++) { A.lastSpun = true; await A.spin(); ok = await stand(); }
    if (ok < 0) return null;
    const lab = await A.press(/^כניסה ל/);
    await A.waitFor(() => A.inside(), 9000);
    await p.waitForTimeout(1200);
    return lab;
  };
  // Click the first button matching `re` that is really on top at its own centre (the paused
  // city stays in the DOM under the service screen, with its own "חזרה" at opacity 0).
  A.pressTop = async (re) => {
    const hit = await p.evaluate((src) => {
      const re = new RegExp(src);
      for (const e of document.querySelectorAll('[role=button],button,a[href]')) {
        const lab = ((e.getAttribute('aria-label') || '').trim() || (e.innerText || '').trim().replace(/\s+/g, ' '));
        if (!re.test(lab)) continue;
        const r = e.getBoundingClientRect(); if (!r.width) continue;
        const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y);
        if (top && (e === top || e.contains(top))) return { x, y, lab };
      }
      return null;
    }, re.source);
    if (!hit) return null;
    await p.mouse.click(hit.x, hit.y); await p.waitForTimeout(900); return hit.lab;
  };
  // A race-free `press(re, {nth})`: the on-top match if any, else a DOM click on the first match.
  A.press = async (re, { nth = 0 } = {}) => {
    const lab = await p.evaluate(([src, nth]) => {
      const re = new RegExp(src); const c = [];
      for (const e of document.querySelectorAll('[role=button],button,[role=checkbox],[role=radio],[role=link],a[href],[role=tab],[role=switch],[role=menuitem]')) {
        const a = (e.getAttribute('aria-label') || '').trim(); const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
        const lab = re.test(a) ? a : t; if (!re.test(lab)) continue;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        c.push({ e, lab, onTop: Boolean(top && (e === top || e.contains(top))) });
      }
      const pick = (c.filter((x) => x.onTop)[nth]) || c[nth]; if (!pick) return null;
      pick.e.scrollIntoView({ block: 'center' }); pick.e.click(); return pick.lab;
    }, [re.source, nth]);
    await p.waitForTimeout(900); return lab;
  };
  // The street's colour veil (City.tsx S.veil) right now, and whether the city layer is showing.
  A.veilNow = () => p.evaluate(() => { const v = [...document.querySelectorAll('div')].find((d) => (d.style.transition || '').includes('opacity 460ms')); return v ? Number(v.style.opacity || 0) : null; });
  A.rewatch = () => p.evaluate(() => { const w = window.__qaW; if (w) { w.loads = 0; w.maxVeil = 0; w.sawLoad = false; } const c = document.querySelector('canvas'); return Boolean(c && c.__qaMark); });
  // Reads the City component's own React state (hooks 0..12) — for diagnosis only.
  A.cityState = () => p.evaluate(() => {
    const canvas = document.querySelector('canvas'); if (!canvas) return null;
    const host = canvas.parentElement; const k = Object.keys(host).find((x) => x.startsWith('__reactFiber'));
    let f = host[k]; while (f && !(typeof f.type === 'function' && f.memoizedState && f.memoizedState.memoizedState && f.memoizedState.memoizedState.current === host)) f = f.return;
    if (!f) return null;
    const names = ['host', 'pausedRef', 'ready', 'nearName', 'nearId', 'room', 'doorstep', 'insideShop', 'insideRef', 'veil', 'walking', 'hint', 'arriving'];
    const out = {}; let h = f.memoizedState; let i = 0;
    while (h && i < names.length) { let v = h.memoizedState; if (v && typeof v === 'object' && 'current' in v) v = v.current; if (v && typeof v === 'object') v = v.id ?? (v.he ?? (v instanceof HTMLElement ? 'el' : JSON.stringify(v).slice(0, 60))); out[names[i]] = v; h = h.next; i++; }
    return out;
  });
  return A;
}
