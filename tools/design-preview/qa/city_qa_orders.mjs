// Several orders at once, ordered from inside a shop in the street (spec: out/multi-order-spec.md).
// Order 1 from home (a leak). Then the street → the beauty shop → haircut, while order 1 is live.
// Then: the switcher, the home dock, "הקריאות שלי", and the city strip — each shows both, each opens.
// Run: URL0='http://127.0.0.1:4421/?time=night' node qa/city_qa_orders.mjs
import { open, SHOPS } from './city_qa_lib.mjs';
const A = await open('orders');
const { p } = A;
const S = Object.fromEntries(SHOPS.map((s) => [s.id, s]));
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const labels = (re) => p.evaluate((src) => { const re = new RegExp(src); return [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).filter((l) => re.test(l)); }, re.source);
// Visible text of the top screen only (the paused city stays in the DOM underneath).
const topText = () => p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const el = n.parentElement; if (!el) continue; const r = el.getBoundingClientRect(); if (!r.width) continue; const t = document.elementFromPoint(Math.min(389, Math.max(0, r.left + r.width / 2)), Math.min(843, Math.max(0, r.top + r.height / 2))); if (t && (t === el || el.contains(t) || t.contains(el))) out.push(n.textContent.trim()); } return out.filter(Boolean).join(' ').replace(/\s+/g, ' '); });
const clickLabel = async (re) => { const loc = p.getByLabel(re).first(); if (!(await loc.count())) return false; const ok = await loc.evaluate((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(t && (e === t || e.contains(t))); }); if (ok) { const b = await loc.boundingBox(); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); } else await loc.evaluate((e) => e.click()); await p.waitForTimeout(1500); return true; };
const sendAndAccept = async () => {
  const ta = p.locator('textarea').filter({ visible: true }).first(); if (await ta.count()) await ta.fill('בדיקה: הזמנה נוספת מתוך חנות ברחוב');
  const line = p.getByRole('checkbox').filter({ visible: true }).first(); if (await line.count()) await line.click({ force: true }).catch(() => {});
  const sent = await A.pressTop(/^שליחת הקריאה/);
  for (let i = 0; i < 15 && !(await A.has('כן, מתאים לי')); i++) await p.waitForTimeout(1000);
  const yes = await A.pressTop(/^כן, מתאים לי/); await p.waitForTimeout(1800);
  await p.mouse.click(195, 420); await p.waitForTimeout(900);
  return { sent, yes };
};
try {
  await A.toHome();
  // Order 1, from home.
  await A.press(/^תיקונים בבית$/); await A.press(/^נזילה או דליפת מים/); await p.waitForTimeout(800);
  await A.pressTop(/^בקשת .* עכשיו$/); await p.waitForTimeout(800);
  const o1 = await sendAndAccept();
  check('order 1 (leak) sent and accepted', Boolean(o1.sent && o1.yes), JSON.stringify(o1));
  await A.snap('o1_tracking');
  await A.pressTop(/^חזרה$/); await p.waitForTimeout(1000);
  check('home: one order in the dock', (await labels(/בדרך|מחפשים|נזילה/)).length > 0, JSON.stringify(await labels(/הזמנה|נזילה|בדרך/)));
  await A.snap('o1_home');

  // The street, with one order live.
  await A.press(/טיול ברחוב/); await A.cityReady(); await A.watch();
  await p.waitForTimeout(1500);
  const hud1 = await labels(/הזמנה \d מתוך|נזילה/);
  check('street with one live order: the HUD shows it', hud1.length > 0, JSON.stringify(hud1));
  await A.snap('street_one_order');

  // Into the beauty shop, order a haircut.
  const lab = await A.enterShop(S.hair);
  check('enter the beauty shop', Boolean(lab) && (await A.inside()), String(lab));
  const hudIn = await labels(/הזמנה \d מתוך|נזילה/);
  check('inside the shop: the HUD still shows order 1', hudIn.length > 0, JSON.stringify(hudIn));
  await A.snap('in_hair_with_order');
  await A.press(/^מה אפשר להזמין כאן/); await p.waitForTimeout(1300);
  const menu = (await A.buttons()).filter((b) => /›$/.test(b) && !/^מה אפשר|^חזרה/.test(b));
  console.log('   hair menu:', JSON.stringify(menu));
  const pick = menu.find((b) => /תספורת/.test(b)) ?? menu[0];
  await A.pressTop(new RegExp('^' + pick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')); await p.waitForTimeout(1500);
  const svcTop = await topText();
  check('service page from the shop says this is an additional order (spec §6.1)', /הזמנה נוספת/.test(svcTop), svcTop.slice(0, 200));
  await A.snap('o2_service');
  await A.pressTop(/^בקשת .* עכשיו$/); await p.waitForTimeout(1200);
  await A.snap('o2_describe');
  const o2 = await sendAndAccept();
  check('order 2 (from the shop) sent and accepted', Boolean(o2.sent && o2.yes), JSON.stringify(o2));
  await A.snap('o2_tracking');
  const t2 = await topText();
  check('order 2 screen: switcher "2 מתוך 2"', /2 מתוך 2/.test(t2) || (await labels(/מתוך 2/)).length > 0, `${t2.slice(0, 160)} labels=${JSON.stringify(await labels(/מתוך 2/))}`);

  // Switcher: open order 1 from order 2's screen, and back.
  const sw = await labels(/^הזמנה \d מתוך 2/);
  check('switcher has both orders', sw.length >= 2, JSON.stringify(sw));
  if (await clickLabel(/^הזמנה 1 מתוך 2/)) { const tx = await topText(); check('switcher → order 1 is the leak', /נזילה/.test(tx), tx.slice(0, 160)); await A.snap('switch_to_1'); }
  if (await clickLabel(/^הזמנה 2 מתוך 2/)) { const tx = await topText(); check('switcher → order 2 is the haircut', /תספורת|שיער|ספר/.test(tx), tx.slice(0, 160)); await A.snap('switch_to_2'); }

  // Back from order 2: where does it land?
  await A.pressTop(/^חזרה$/); await p.waitForTimeout(1500);
  const st = await A.cityState();
  console.log('   back from order 2 →', st?.pausedRef === false ? `the city (inside=${st.insideShop} room=${st.room})` : (await topText()).slice(0, 100));
  await A.snap('o2_back');

  // The city strip.
  if (st?.pausedRef !== false) { for (let i = 0; i < 3 && (await A.cityState())?.pausedRef !== false; i++) { if (!(await A.pressTop(/^חזרה$/))) break; } }
  if ((await A.cityState())?.pausedRef !== false) { await A.press(/טיול ברחוב/); await A.cityReady(); }
  await p.waitForTimeout(1500);
  const strip = await labels(/^הזמנה \d מתוך 2/);
  check('city strip: both orders', strip.length >= 2, JSON.stringify(strip));
  await A.snap('city_strip');
  if (await clickLabel(/^הזמנה 1 מתוך 2/)) { const tx = await topText(); check('city strip → order 1 opens (leak)', /נזילה/.test(tx), tx.slice(0, 160)); await A.snap('strip_1'); await A.pressTop(/^חזרה$/); await p.waitForTimeout(1500); }
  const backTo1 = await A.cityState();
  check('back from order 1 (opened from the city strip) → the city', backTo1?.pausedRef === false, backTo1?.pausedRef === false ? '' : (await topText()).slice(0, 100));
  if (backTo1?.pausedRef !== false) { await A.press(/טיול ברחוב/); await A.cityReady(); await p.waitForTimeout(1200); }
  if (await clickLabel(/^הזמנה 2 מתוך 2/)) { const tx = await topText(); check('city strip → order 2 opens (haircut)', /תספורת|שיער|ספר/.test(tx), tx.slice(0, 160)); await A.snap('strip_2'); }

  // Home dock.
  for (let i = 0; i < 4 && !(await A.has('טיול ברחוב של פרו נאו')); i++) { if (!(await A.pressTop(/^חזרה$/))) break; await p.waitForTimeout(800); }
  const dock = await labels(/^הזמנה \d מתוך 2/);
  check('home dock: both orders', dock.length >= 2, `${JSON.stringify(dock)} on: ${(await topText()).slice(0, 60)}`);
  await A.snap('home_dock');
  if (await clickLabel(/^הזמנה 1 מתוך 2/)) { const tx = await topText(); check('home dock → order 1 (leak)', /נזילה/.test(tx), tx.slice(0, 160)); await A.pressTop(/^חזרה$/); await p.waitForTimeout(1000); }
  if (await clickLabel(/^הזמנה 2 מתוך 2/)) { const tx = await topText(); check('home dock → order 2 (haircut)', /תספורת|שיער|ספר/.test(tx), tx.slice(0, 160)); await A.pressTop(/^חזרה$/); await p.waitForTimeout(1000); }

  // הקריאות שלי
  await A.press(/^תפריט$/); await A.press(/^הקריאות שלי/); await p.waitForTimeout(1000);
  const calls = await topText();
  check('"הקריאות שלי": both live orders', /נזילה/.test(calls) && /תספורת/.test(calls), calls.slice(0, 260));
  await A.snap('calls');
  const callBtns = (await A.buttons()).filter((b) => /נזילה|תספורת/.test(b));
  console.log('   calls buttons:', JSON.stringify(callBtns));
  for (const [re, want, name] of [[/נזילה/, /נזילה/, 'leak'], [/תספורת/, /תספורת|שיער|ספר/, 'haircut']]) {
    const b = callBtns.find((x) => re.test(x));
    if (!b) { check(`"הקריאות שלי" → ${name}: a row to open`, false, 'no button'); continue; }
    await A.pressTop(new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 40))); await p.waitForTimeout(1500);
    const tx = await topText(); check(`"הקריאות שלי" → ${name} opens`, want.test(tx) && !/הקריאות שלי/.test(tx.slice(0, 40)), tx.slice(0, 160));
    await A.snap('calls_' + name);
    await A.pressTop(/^חזרה$/); await p.waitForTimeout(1000);
  }
  console.log('watch', JSON.stringify(await A.watched()));
} catch (e) { fails++; console.log('THREW', String(e).slice(0, 300)); await A.snap('threw'); }
console.log('errs', JSON.stringify(A.errs));
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
await A.b.close();
