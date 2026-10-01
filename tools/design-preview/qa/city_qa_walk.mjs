// Amit's walk, with no teleporting: from the start of the street, run to Lust, go in, try to walk
// out with the stick, leave, then walk on and go into the next shop by its door.
// Run: URL0='http://127.0.0.1:4421/?time=night' node qa/city_qa_walk.mjs [button|back]
import { open } from './city_qa_lib.mjs';
const how = process.argv[2] || 'button';
const A = await open('walk_' + how);
const { p } = A;
const log = (...a) => console.log(...a);
const check = (name, ok, extra = '') => log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
const door = async () => (await A.buttons()).find((b) => /^כניסה ל/.test(b)) ?? null;
// Hold the stick and poll; stop when `until` returns something.
const hold = async (x, y, ms, until) => { const t0 = Date.now(); const seen = []; await A.stick(x, y);
  while (Date.now() - t0 < ms) { await p.waitForTimeout(200); const pl = (await A.pill()).at(-1) ?? '-'; if (seen.at(-1) !== pl) seen.push(pl); const u = until ? await until() : null; if (u) { await A.stick(0, 0); return { hit: u, seen }; } }
  await A.stick(0, 0); return { hit: null, seen }; };
try {
  await A.toHome(); await A.press(/טיול ברחוב/); log('ready', await A.cityReady());
  await A.watch();
  await hold(0, -0.5, 1200);
  await hold(1, 0, 2600); // across to the +x pavement
  const r1 = await hold(0, -0.95, 30000, async () => { const d = await door(); return d && d.includes('Lust') ? d : null; });
  check('walked to Lust: its door button shows', Boolean(r1.hit), `pills on the way: ${r1.seen.join(' → ')}`);
  await A.snap('at_lust');
  await A.press(/^כניסה לLust/); await A.waitFor(() => A.inside(), 9000); await p.waitForTimeout(1200);
  check('inside Lust', await A.inside(), JSON.stringify(await A.pill()));
  await A.snap('in_lust');
  // Amit's move: push the stick to walk out.
  const r2 = await hold(0, 1, 4000, async () => !(await A.inside()));
  check('stick pulled back 4 s walks out of Lust', Boolean(r2.hit), `pill stayed: ${r2.seen.join(' → ')}`);
  const r3 = await hold(0, -1, 3000, async () => !(await A.inside()));
  check('stick pushed forward 3 s walks out of Lust', Boolean(r3.hit), `pill stayed: ${r3.seen.join(' → ')}`);
  await A.snap('lust_after_stick');
  if (await A.inside()) { if (how === 'back') await A.histBack(); else await A.press(/חזרה לרחוב/); }
  await A.waitFor(async () => !(await A.inside()), 5000); await p.waitForTimeout(2200);
  check(`left Lust with ${how}`, !(await A.inside()), JSON.stringify(await A.pill()));
  await A.snap('out_of_lust');
  // Walk on the way the figure now faces, 4 s, reading the pill.
  const r4 = await hold(0, -0.6, 4000);
  check('walking on after Lust: the pill never says "אתם בפנים"', !r4.seen.some((s) => s.includes('אתם בפנים')), r4.seen.join(' → '));
  await A.snap('walked_on');
  // Turn round and walk down the street until a door other than Lust is offered.
  await A.spin();
  const r5 = await hold(0, -0.6, 30000, async () => { const d = await door(); return d && !d.includes('Lust') ? d : null; });
  check('walking down the street: the next shop offers its own door', Boolean(r5.hit), `${r5.hit} · pills: ${r5.seen.join(' → ')}`);
  await A.snap('next_door');
  if (r5.hit) {
    const want = r5.hit.replace(/^כניסה ל/, '').replace(/\s*‹$/, '');
    await A.press(/^כניסה ל/); await A.waitFor(() => A.inside(), 9000); await p.waitForTimeout(1200);
    const pl = await A.pill();
    check(`entered "${want}", not Lust`, pl.some((t) => t.startsWith(want) && t.includes('אתם בפנים')) && !pl.some((t) => t.startsWith('Lust')), JSON.stringify(pl));
    await A.snap('in_next');
  }
  log('watch', JSON.stringify(await A.watched()));
} catch (e) { log('THREW', String(e).slice(0, 300)); await A.snap('threw'); }
log('errs', JSON.stringify(A.errs));
await A.b.close();
