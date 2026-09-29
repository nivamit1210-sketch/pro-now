/**
 * THE WHOLE JOURNEY, AGAINST A RUNNING SERVER.
 *
 * The unit tests prove the rules. This proves the product: one customer
 * signing in, picking a real service out of the catalogue, giving an
 * address, being matched with a real professional, and that professional
 * driving, arriving, quoting, being approved and finishing — every step
 * over HTTP against the API, the database and the dispatch engine
 * together.
 *
 * It exists because the parts were all green while the whole had never
 * run. The first time it was attempted end to end it failed at six
 * different steps, and five of those were defects nothing else had
 * caught: an offer that expired into a dead end, a professional stranded
 * out of the market, a Redis outage taking down `accept`, an error
 * handler that had never once executed, and a malformed body answered
 * with 500 and the validator's internals.
 *
 * Requires: the API on :4000, a seeded database, and demonstration
 * professionals (`npm run db:seed:dev`). Run: `npm run verify:journey`.
 */
// API_URL points it at a server on another port (e.g. beside a running dev server).
const API = process.env.API_URL ?? "http://127.0.0.1:4000";

let failures = 0;
const line = (s) => console.log(s);
const ok = (s, extra = "") => line(`  PASS  ${s}${extra ? "  " + extra : ""}`);
const bad = (s, extra = "") => {
  failures += 1;
  line(`  FAIL  ${s}${extra ? "  " + extra : ""}`);
};

async function call(method, path, { token, body, idem } = {}) {
  // The Origin a browser on the app's own site sends: Better Auth refuses
  // browser-shaped requests without it (CSRF), and so should everything.
  const headers = { "content-type": "application/json", origin: process.env.PUBLIC_URL ?? "http://localhost:4000" };
  // `token` is the session cookie (sign-in is Better Auth since W1).
  if (token) headers.cookie = token;
  if (idem) headers["idempotency-key"] = idem;
  // Fastify refuses an application/json request with no body at all, and
  // several of these endpoints legitimately take none. Send an empty
  // object rather than nothing.
  const res = await fetch(API + path, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body is itself the finding */
  }
  return { status: res.status, json, text };
}

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

/**
 * Signs in the way a person does: ask for an email link, read it out of
 * Mailpit, open it. Returns the session cookie, or null.
 */
async function login(email) {
  const asked = await call("POST", "/api/auth/sign-in/magic-link", { body: { email, callbackURL: "/" } });
  if (asked.status !== 200) return null;
  let link = null;
  for (let i = 0; i < 40 && !link; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const id = found.messages?.[0]?.ID;
    if (id) link = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).Text.match(/https?:\/\/\S+/)?.[0];
    else await new Promise((r) => setTimeout(r, 100));
  }
  if (!link) return null;
  const opened = await fetch(link, { redirect: "manual" });
  const cookie = opened.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return cookie || null;
}

const run = async () => {
  line("\n== THE CUSTOMER ==");
  const custToken = await login(`customer-${Date.now()}@pronow.test`);
  custToken ? ok("customer signs in") : bad("customer signs in");

  const cat = await call("GET", "/api/v1/catalog");
  const depts = cat.json?.departments ?? cat.json ?? [];
  Array.isArray(depts) && depts.length
    ? ok("catalogue loads", `${depts.length} departments`)
    : bad("catalogue loads", JSON.stringify(cat.json).slice(0, 120));

  // Find a VISIT_QUOTE service so the quote path is exercised too.
  const flat = JSON.stringify(cat.json);
  const svcId = (flat.match(/"id":"([^"]+)","code":"HOME_PLUMB_LEAK"/) ||
    flat.match(/"code":"HOME_PLUMB_LEAK"[^}]*?"id":"([^"]+)"/) || [])[1];
  svcId ? ok("service found in catalogue", "HOME_PLUMB_LEAK") : bad("service found in catalogue");

  const addr = await call("POST", "/api/v1/me/addresses", {
    token: custToken,
    body: { formatted: "פלורנטין 12, תל אביב", lat: 32.056, lng: 34.77, label: "בית" },
  });
  const addrId = addr.json?.address?.id ?? addr.json?.id;
  addrId ? ok("address saved") : bad("address saved", addr.text.slice(0, 120));

  const job = await call("POST", "/api/v1/jobs", {
    token: custToken,
    idem: "walk-" + Date.now(),
    body: {
      serviceId: svcId,
      addressId: addrId,
      description: "נזילה מתחת לכיור במטבח",
      structuredAnswers: { floor: "3", water_shut: "no" },
    },
  });
  const jobId = job.json?.job?.id;
  const dispatch = job.json?.dispatch;
  jobId ? ok("job created") : bad("job created", job.text.slice(0, 160));
  if (dispatch?.status !== "OFFER_SENT") {
    /*
     * Everything after this point is about a professional who was never
     * asked, so it stops here rather than reporting eight consequences of
     * one cause. The usual reason is that the demonstration cohort is
     * busy with the previous run — the fixture is reset by the npm
     * script, not by this file, so that running the walk never silently
     * drags somebody out of a live job.
     */
    bad("dispatch sent an offer", JSON.stringify(dispatch));
    line("\n  Nobody was available to ask. `npm run db:seed:dev` returns the");
    line("  demonstration professionals to AVAILABLE; `npm run dev:pulse` keeps");
    line("  their positions current, without which they age out in 90 seconds.\n");
    process.exit(1);
  }
  ok("dispatch sent an offer", `${dispatch.candidatesEligible}/${dispatch.candidatesConsidered} eligible`);

  line("\n== THE PROFESSIONAL ==");
  // The seeded professional +972500000101 (apps/api/prisma/seed-dev.ts).
  const proToken = await login("pro-0101@pronow.test");
  proToken ? ok("professional signs in") : bad("professional signs in");

  const offer = await call("GET", "/api/v1/pro/offers/current", { token: proToken });
  const offerId = offer.json?.offerId;
  offerId ? ok("offer is waiting", offer.json.serviceNameHe) : bad("offer is waiting", offer.text.slice(0, 160));

  offer.json?.customerAreaLabel && !offer.json?.addressHe
    ? ok("address withheld before accept", offer.json.customerAreaLabel)
    : bad("address withheld before accept");

  const accept = await call("POST", `/api/v1/offers/${offerId}/accept`, {
    token: proToken,
    idem: "acc-" + Date.now(),
  });
  accept.status === 200
    ? ok("professional accepts")
    : bad("professional accepts", `${accept.status} ${accept.text.slice(0, 200)}`);

  const proJob = await call("GET", `/api/v1/pro/jobs/${jobId}`, { token: proToken });
  proJob.status === 200
    ? ok("professional's job detail", `address=${proJob.json?.addressHe ?? "—"}`)
    : bad("professional's job detail", `${proJob.status} ${proJob.text.slice(0, 200)}`);

  proJob.json?.structuredAnswers
    ? ok("intake answers reached the professional", JSON.stringify(proJob.json.structuredAnswers))
    : bad("intake answers reached the professional");

  // Only now: useJobWatch asks for the match once assignedProfessionalId is set.
  const match = await call("GET", `/api/v1/jobs/${jobId}/match`, { token: custToken });
  match.status === 200
    ? ok("the customer learns who is coming", `${match.json?.professional?.displayName ?? "?"} · ETA ${match.json?.eta?.etaSeconds ?? "?"}s`)
    : bad("the customer learns who is coming", `${match.status} ${match.text.slice(0, 120)}`);

  /*
   * THE PRICE IS THE PROFESSIONAL'S OWN, AND THEY CAN SET IT.
   *
   * Until `PATCH /v1/pro/services/:id/pricing` existed, nothing in the
   * product could write `basePriceMinorUnits` except the development
   * seed — so settlement answered NO_CONFIGURED_PRICE for every real
   * professional, after the work was already done.
   */
  line("\n== THE PRICE ==");
  const svcPricing = await call("PATCH", `/api/v1/pro/services/${svcId}/pricing`, {
    token: proToken,
    body: { basePriceMinorUnits: 15000 },
  });
  svcPricing.status === 200 && svcPricing.json?.chargeable === true
    ? ok("the professional sets their own visit fee", `₪${(svcPricing.json.basePriceMinorUnits / 100).toFixed(2)}`)
    : bad("the professional sets their own visit fee", `${svcPricing.status} ${svcPricing.text.slice(0, 160)}`);

  const wrongField = await call("PATCH", `/api/v1/pro/services/${svcId}/pricing`, {
    token: proToken,
    body: { basePriceMinorUnits: 15000, minimumBillableMinutes: 120 },
  });
  wrongField.status === 400
    ? ok("a field this price model has no meaning for is refused, not dropped")
    : bad("a field this price model has no meaning for is refused, not dropped", `${wrongField.status}`);

  line("\n== THE JOB RUNS ==");
  for (const [label, path] of [
    ["professional sets off", `/api/v1/jobs/${jobId}/en-route`],
    ["professional arrives", `/api/v1/jobs/${jobId}/arrive`],
    // For a VISIT_QUOTE service /start means DIAGNOSIS, not IN_PROGRESS —
    // the price is agreed before the work begins.
    ["professional starts looking", `/api/v1/jobs/${jobId}/start`],
  ]) {
    const r = await call("POST", path, { token: proToken, idem: label + Date.now() });
    r.status === 200 ? ok(label) : bad(label, `${r.status} ${r.text.slice(0, 160)}`);
  }

  line("\n== THE QUOTE ==");
  const quote = await call("POST", `/api/v1/jobs/${jobId}/quotes`, {
    token: proToken,
    body: {
      lineItems: [
        { description: "החלפת סיפון", quantity: 1, unitPriceMinorUnits: 22000, kind: "MATERIALS" },
        { description: "עבודה", quantity: 1, unitPriceMinorUnits: 15000, kind: "LABOR" },
      ],
      notes: "כולל אחריות שנה",
    },
  });
  const quoteId = quote.json?.quote?.id;
  const versionHash = quote.json?.quote?.versionHash;
  quoteId
    ? ok("professional sends a quote", `₪${(quote.json.quote.totalMinorUnits / 100).toFixed(2)}`)
    : bad("professional sends a quote", `${quote.status} ${quote.text.slice(0, 200)}`);

  // The bug fixed on the move: this used to be null forever.
  const proJob2 = await call("GET", `/api/v1/pro/jobs/${jobId}`, { token: proToken });
  (proJob2.json?.pendingQuote?.id ?? proJob2.json?.approvedQuote?.id) === quoteId
    ? ok("the quote is visible to the professional", `${(proJob2.json.pendingQuote ?? proJob2.json.approvedQuote).lineItems?.length ?? 0} line items`)
    : bad("the pending quote is visible to the professional", JSON.stringify(proJob2.json?.pendingQuote));

  // With no money in the app (IN_APP_PAYMENTS=off, D1) the quote is
  // approved on sending; with payments on, the customer approves it.
  const noMoney = quote.json?.autoApproved === true;
  if (noMoney) {
    ok("the quote is approved on sending (no money in the app, D1)");
  } else {
    const approve = await call("POST", `/api/v1/quotes/${quoteId}/approve`, {
      token: custToken,
      idem: "appr-" + Date.now(),
      body: { quoteId, quoteVersionHash: versionHash },
    });
    approve.status === 200
      ? ok("customer approves the quote")
      : bad("customer approves the quote", `${approve.status} ${approve.text.slice(0, 200)}`);
  }

  line("\n== THE END ==");
  // Approving the quote already moved the job to IN_PROGRESS — the work
  // begins because the price was agreed, not because of a second tap.
  const complete = await call("POST", `/api/v1/jobs/${jobId}/complete`, {
    token: proToken,
    idem: "done-" + Date.now(),
  });
  complete.status === 200 ? ok("job completes") : bad("job completes", `${complete.status} ${complete.text.slice(0, 160)}`);

  // Before the customer confirms, a review is still premature and the
  // server still says so. The refusal is as much a feature as the charge.
  const early = await call("POST", `/api/v1/jobs/${jobId}/reviews`, {
    token: custToken,
    idem: "early-" + Date.now(),
    body: { overallRating: 5, text: "מוקדם מדי" },
  });
  early.status === 409
    ? ok("a review before payment is refused")
    : bad("a review before payment is refused", `${early.status} ${early.text.slice(0, 160)}`);

  line("\n== THE MONEY ==");
  /*
   * Earnings are a lifetime total, so this job's effect on them is a
   * DIFFERENCE. Asserting the total would assert that this is the only
   * job the professional has ever done, which it is not after the second
   * run — and the assertion would start failing for a reason that has
   * nothing to do with the code under test.
   */
  const before = await call("GET", "/api/v1/pro/earnings", { token: proToken });
  const grossBefore = before.json?.grossMinorUnits ?? 0;
  const netBefore = before.json?.netMinorUnits ?? 0;

  const confirmed = await call("POST", `/api/v1/jobs/${jobId}/confirm-completion`, {
    token: custToken,
    idem: "confirm-" + Date.now(),
  });
  if (noMoney) {
    confirmed.status === 200 && confirmed.json?.status === "REVIEW_PENDING" && confirmed.json?.receipt?.paidInApp === false
      ? ok(
          "the customer confirms; no money moves, the receipt says what is owed",
          confirmed.json.receipt.amountMinorUnits === null
            ? `no amount: ${confirmed.json.receipt.reason}`
            : `₪${(confirmed.json.receipt.amountMinorUnits / 100).toFixed(2)} to the professional directly`
        )
      : bad("the customer confirms and the review opens", `${confirmed.status} ${confirmed.text.slice(0, 200)}`);
  } else confirmed.status === 200 && confirmed.json?.status === "CAPTURED"
    ? ok(
        "the customer confirms and the payment is captured",
        `₪${(confirmed.json.amountMinorUnits / 100).toFixed(2)} · ${confirmed.json.ledgerRows} ledger row(s)`
      )
    : bad("the customer confirms and the payment is captured", `${confirmed.status} ${confirmed.text.slice(0, 200)}`);

  /*
   * THE LEDGER AGREES WITH ITSELF, WHICHEVER STATE THE BUSINESS IS IN.
   *
   * Asserting one row would be asserting that no commission is
   * configured, which is a fact about the environment rather than about
   * the code. Both states are correct and they must be CONSISTENT:
   *
   *   no commission set → CUSTOMER_CHARGE alone, and the professional's
   *     net is zero because what they are owed depends on a number nobody
   *     has chosen (/CLAUDE.md §4);
   *   commission set → charge, fee and payable, and the fee plus the
   *     payable equal the charge exactly.
   *
   * A ledger that is neither is the bug this is looking for.
   */
  const rows = noMoney ? null : confirmed.json?.ledgerRows;
  const after = await call("GET", "/api/v1/pro/earnings", { token: proToken });
  const chargedHere = (after.json?.grossMinorUnits ?? 0) - grossBefore;
  const payableHere = (after.json?.netMinorUnits ?? 0) - netBefore;
  const amount = confirmed.json?.amountMinorUnits ?? 0;
  const chargedHereOrZero = () => chargedHere;

  if (noMoney) {
    chargedHereOrZero() === 0
      ? ok("no money in the app, so the earnings ledger did not move")
      : bad("no money in the app, so the earnings ledger did not move", `gross moved by ${chargedHereOrZero()}`);
  } else if (rows === 1) {
    chargedHere === amount && payableHere === 0
      ? ok(
          "no commission set, so nothing is invented",
          `charged ₪${(chargedHere / 100).toFixed(2)}, payable left unwritten`
        )
      : bad("no commission set, so nothing is invented", `charged ${chargedHere}, payable ${payableHere}, amount ${amount}`);
  } else if (rows === 3) {
    chargedHere === amount && payableHere > 0 && payableHere < amount
      ? ok(
          "a commission is set, and the split adds up",
          `₪${(chargedHere / 100).toFixed(2)} charged, ₪${(payableHere / 100).toFixed(2)} payable`
        )
      : bad("a commission is set, and the split adds up", `charged ${chargedHere}, payable ${payableHere}, amount ${amount}`);
  } else {
    bad("the ledger is either a charge alone or a charge and a split", `ledgerRows=${rows}`);
  }

  line("\n== THE REVIEW ==");
  const review = await call("POST", `/api/v1/jobs/${jobId}/reviews`, {
    token: custToken,
    idem: "rev-" + Date.now(),
    body: { overallRating: 5, text: "הגיע מהר, פתר הכול" },
  });
  review.status === 200
    ? ok("the customer reviews the job")
    : bad("the customer reviews the job", `${review.status} ${review.text.slice(0, 200)}`);

  /*
   * AND THE REVIEW BECOMES A FACT ABOUT THEM.
   *
   * This is the end of the chain the whole ordering was chosen for.
   * dispatch-service.ts scored every candidate on a hard-written 4.8
   * because reviews were unreachable, and reviews were unreachable
   * because payment did not exist. A second request now shows the rating
   * on the match card — real, with its count beside it, from work that
   * actually happened.
   */
  const second = await call("POST", "/api/v1/jobs", {
    token: custToken,
    idem: "rated-" + Date.now(),
    body: { serviceId: svcId, addressId: addrId, description: "עוד נזילה", structuredAnswers: {} },
  });
  const secondJobId = second.json?.job?.id;
  if (second.json?.dispatch?.status === "OFFER_SENT" && secondJobId) {
    const offer2 = await call("GET", "/api/v1/pro/offers/current", { token: proToken });
    await call("POST", `/api/v1/offers/${offer2.json?.offerId}/accept`, { token: proToken, idem: "acc2-" + Date.now() });
    const m = await call("GET", `/api/v1/jobs/${secondJobId}/match`, { token: custToken });
    const avg = m.json?.professional?.proNowRatingAverage;
    const count = m.json?.professional?.proNowRatingCount;
    typeof avg === "number" && count > 0
      ? ok("the rating the customer sees comes from real reviews", `${avg.toFixed(2)} from ${count}`)
      : bad("the rating the customer sees comes from real reviews", JSON.stringify(m.json?.professional ?? m.text.slice(0, 120)));
    await call("POST", `/api/v1/jobs/${secondJobId}/cancel`, { token: custToken });
  } else {
    bad("a second job reaches the same professional", JSON.stringify(second.json?.dispatch));
  }

  const badBody = await call("POST", `/api/v1/jobs/${jobId}/reviews`, { token: custToken, idem: "bad-" + Date.now(), body: { nonsense: true } });
  badBody.status === 400 && badBody.json?.code === "VALIDATION_FAILED"
    ? ok("a malformed body is a 400, not a 500")
    : bad("a malformed body is a 400, not a 500", `${badBody.status} ${badBody.text.slice(0, 120)}`);

  const final = await call("GET", `/api/v1/jobs/${jobId}`, { token: custToken });
  line(`\n  final job status: ${final.json?.job?.status ?? "?"}`);
  line(`  events recorded:  ${final.json?.job?.events?.length ?? final.json?.events?.length ?? "?"}`);

  /*
   * THE REFUSAL, WHICH IS THE HARDER HALF TO PROVE.
   *
   * Everything above shows the product saying yes. `ServiceRequirement`
   * rows existed nowhere until 2026-09-22, so the credential engine had
   * been evaluating every candidate against an empty list and saying yes
   * to everybody — and a walk that only checks the happy path cannot tell
   * that apart from the rule working.
   *
   * So: ask for a trade whose licence nobody in the demonstration cohort
   * holds. The right answer is nobody, and it has to come from the
   * credential rule rather than from an empty market, which is why the
   * count of candidates CONSIDERED has to be non-zero.
   */
  line("\n== THE REFUSAL ==");
  const licensed = (flat.match(/"id":"([^"]+)","code":"PEST_CONTROL"/) ||
    flat.match(/"code":"PEST_CONTROL"[^}]*?"id":"([^"]+)"/) || [])[1];

  if (!licensed) {
    bad("a licensed trade is in the catalogue", "PEST_CONTROL not found");
  } else {
    const gated = await call("POST", "/api/v1/jobs", {
      token: custToken,
      idem: "gate-" + Date.now(),
      body: { serviceId: licensed, addressId: addrId, description: "ג'וקים במטבח", structuredAnswers: {} },
    });
    const outcome = gated.json?.dispatch;
    /*
     * `considered > 0` is the half that matters. A walk that finds nobody
     * because nobody offers the trade proves only that the market is
     * empty; the rule and an empty market look identical from outside.
     * `db:seed:dev` therefore includes one professional who offers pest
     * control and holds no pest control licence, so dispatch has somebody
     * to look at and refuse.
     */
    outcome?.status !== "OFFER_SENT" &&
    outcome?.candidatesEligible === 0 &&
    outcome?.candidatesConsidered > 0
      ? ok(
          "an unlicensed professional is considered and refused",
          `${outcome.candidatesConsidered} considered, 0 eligible`
        )
      : bad("an unlicensed professional is considered and refused", JSON.stringify(outcome));

    // And the job does not silently die: the sweep picks it up and, past
    // the search deadline, tells the customer rather than leaving them.
    const gatedJobId = gated.json?.job?.id;
    if (gatedJobId) {
      await call("POST", `/api/v1/jobs/${gatedJobId}/cancel`, { token: custToken });
    }
  }

  line(`\n${failures === 0 ? "ALL STEPS PASSED" : failures + " STEP(S) FAILED"}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
