// Every shop in the street: in and out three ways — "‹ חזרה לרחוב", walking out with the
// stick, and the phone's back — then the next shop. One browser, one street, in order.
// Run: URL0='http://127.0.0.1:4421/?time=night' node qa/city_qa_exit.mjs [button|walk|back] [shopId,...]
import { open, SHOPS } from './city_qa_lib.mjs';
const mode = process.argv[2] || 'button';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const list = only ? SHOPS.filter((s) => only.includes(s.id)) : SHOPS;
const A = await open('exit_' + mode);
const { p } = A;
const rows = [];
const row = (shop, step, ok, extra) => { rows.push({ shop: shop.id, step, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${shop.id.padEnd(9)} ${step}${extra ? '  — ' + extra : ''}`); };
const stateLine = async () => `pill=${JSON.stringify(await A.pill())} buttons=${JSON.stringify(await A.buttons())}`;

// Walk 6 steps down the street (whatever way the figure faces) and report what the pill says.
const walkAndLook = async () => {
  const seen = [];
  for (let i = 0; i < 5; i++) { await A.stick(0, -0.6); await p.waitForTimeout(700); await A.stick(0, 0); await p.waitForTimeout(250); seen.push((await A.pill()).join(' / ') || '-'); }
  return seen;
};

try {
  await A.toHome();
  await A.press(/טיול ברחוב/);
  console.log('ready ms', await A.cityReady());
  await A.watch();
  let prev = null;
  for (const shop of list) {
    const errsBefore = A.errs.length;
    const lab = await A.enterShop(shop);
    const pillIn = await A.pill();
    const inOk = Boolean(lab) && (await A.inside()) && pillIn.some((t) => t.startsWith(shop.he));
    row(shop, `enter (after ${prev ?? 'nothing'})`, inOk, `pressed=${lab}${A.lastSpun ? ' [no door button until the figure was turned round]' : ''} pill=${JSON.stringify(pillIn)}`);
    if (!inOk) { await A.snap(`${shop.id}_enter_fail`); if (await A.inside()) await A.press(/חזרה לרחוב/); await p.waitForTimeout(2500); prev = shop.id; continue; }
    await A.snap(`${shop.id}_inside`);

    if (mode === 'button') {
      await A.press(/חזרה לרחוב/);
    } else if (mode === 'back') {
      await A.histBack();
    } else if (mode === 'walk') {
      // A real finger: down in the lower half of the screen, pulled down (= walk back, towards
      // the door), held for 3 s. City.tsx:1240-1262 turns this into the stick.
      await p.mouse.move(195, 560); await p.mouse.down(); await p.mouse.move(195, 640, { steps: 6 });
      const t = await A.waitFor(async () => !(await A.inside()), 3500, 200);
      await p.mouse.up();
      row(shop, 'walk out: finger pulled down 3.5 s', t >= 0, t >= 0 ? `left after ${t}ms` : `still: ${await stateLine()}`);
      if (t < 0) {
        await A.snap(`${shop.id}_walk_drag_stuck`);
        // The stick itself, every direction, 2.5 s each.
        let gone = false;
        for (const [x, y, name] of [[0, 1, 'down'], [0, -1, 'up'], [1, 0, 'right'], [-1, 0, 'left'], [0.7, 0.7, 'down-right'], [-0.7, 0.7, 'down-left']]) {
          await A.stick(x, y); const t2 = await A.waitFor(async () => !(await A.inside()), 2500, 200); await A.stick(0, 0);
          if (t2 >= 0) { row(shop, `walk out: __stick ${name}`, true, `left after ${t2}ms`); gone = true; break; }
        }
        if (!gone) { row(shop, 'walk out: __stick all 6 directions, 2.5 s each', false, `still inside: ${await stateLine()}`); await A.snap(`${shop.id}_walk_stick_stuck`); await A.press(/חזרה לרחוב/); }
      }
    }
    const leftMs = await A.waitFor(async () => !(await A.inside()), 6000);
    await p.waitForTimeout(2200); // the walk-out plays (ENTRY_MS 1500)
    const url = p.url();
    const stillCity = await p.evaluate(() => Boolean(window.__pnTeleport) && Boolean(document.querySelector('canvas')));
    const homeLike = (await A.text()).includes('טיול ברחוב של פרו נאו');
    row(shop, `${mode}: out of the shop`, leftMs >= 0 && stillCity && !homeLike, `leftMs=${leftMs} stillCity=${stillCity} home=${homeLike} ${await stateLine()}`);
    await A.snap(`${shop.id}_out_${mode}`);
    if (leftMs < 0) { prev = shop.id; continue; }
    const seen = await walkAndLook();
    const stuck = seen.filter((s) => s.includes('אתם בפנים'));
    row(shop, 'walk the street after: no "אתם בפנים"', stuck.length === 0, seen.join(' | '));
    if (A.errs.length > errsBefore) row(shop, 'console', false, A.errs.slice(errsBefore).join(' ; '));
    prev = shop.id;
  }
  console.log('watch', JSON.stringify(await A.watched()));
} catch (e) { console.log('THREW', String(e).slice(0, 300)); await A.snap('threw'); }
console.log('errs', JSON.stringify(A.errs));
const f = rows.filter((r) => !r.ok).length;
console.log(`${mode}: ${rows.length - f} pass, ${f} fail`);
await A.b.close();
