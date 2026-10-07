import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { JobState, OnSiteView } from "@pro-now/types";
import { customerJob, notFound, requireRole } from "../auth/access.js";
import { portraitForViewer } from "../domain/portrait.js";
import { currentCheck, identityBadge } from "../domain/identity-check.js";
import { addressAsView } from "../domain/address-as.js";
import { vehicleForCustomer } from "../domain/vehicle.js";
import { jobServiceNameHe } from "../domain/job/service-name.js";

/**
 * ORDERING FOR SOMEONE ELSE (docs/21 W6; Amit, 2026-09-28): a plumber for
 * grandpa, ordered from the grandson's phone.
 *
 * The orderer shares one link with the person at home. It opens a page
 * with no account and no app: who is coming, what was verified, when, and
 * the one thing to do — ask for the door code before opening. The page has
 * no address and no price, and nothing on it approves or pays (only the
 * orderer does, DECIDED 2026-09-28).
 *
 * The link is a random token; only its sha256 is stored, it expires, and
 * minting a new one retires the old. Sending it by SMS waits for the SMS
 * vendor (docs/18 §Open decisions); until then the orderer shares it.
 */
const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const STAGE: Partial<Record<JobState, OnSiteView["stage"]>> = {
  DRAFT: "searching",
  SEARCHING: "searching",
  OFFERING: "searching",
  PRO_ASSIGNED: "coming",
  PRO_EN_ROUTE: "coming",
  PRO_ARRIVED: "at_door",
  DIAGNOSIS: "inside",
  WAITING_QUOTE_APPROVAL: "inside",
  IN_PROGRESS: "inside",
  COMPLETION_PENDING: "done",
  COMPLETED: "done",
  REVIEW_PENDING: "done",
  CLOSED: "done",
  CANCELLED: "cancelled",
};

export default async function onSiteRoutes(app: FastifyInstance) {
  app.post("/v1/jobs/:id/on-site-link", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await customerJob(app.prisma, req.user!.userId, id);
    if (!job) return notFound(reply, "JOB");
    if (!job.onSiteName) {
      return reply.status(409).send({ code: "NOT_FOR_SOMEONE_ELSE", message: "This job was not ordered for someone else" });
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS);
    await app.prisma.job.update({ where: { id }, data: { onSiteTokenHash: hash(token), onSiteTokenExpiresAt: expiresAt } });
    return { url: `${app.config.PUBLIC_URL.replace(/\/$/, "")}/s/${token}`, expiresAt: expiresAt.toISOString() };
  });

  app.get("/v1/on-site/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const gone = () => reply.status(404).send({ code: "LINK_NOT_FOUND", message: "The link has expired or does not exist" });
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return gone();

    const job = await app.prisma.job.findUnique({
      where: { onSiteTokenHash: hash(token) },
      include: {
        service: { select: { nameHe: true, code: true } },
        customer: { include: { user: { select: { name: true } } } },
        assignedProfessional: { include: { identityChecks: { orderBy: { createdAt: "desc" }, take: 5 }, portraitUpload: true } },
        offers: { where: { status: "ACCEPTED" }, orderBy: { offeredAt: "desc" }, take: 1 },
      },
    });
    if (!job || !job.onSiteName || !job.onSiteTokenExpiresAt || job.onSiteTokenExpiresAt < new Date()) return gone();

    const pro = job.assignedProfessional;
    // Who is coming, as they chose to be seen (D1): most useful to the person opening the door.
    const face = pro ? await portraitForViewer(app.providers.storage, pro) : null;
    const view: OnSiteView = {
      // The orderer's first name only: the person at home knows who they are.
      ordererNameHe: (job.customer.fullName ?? job.customer.user.name ?? "").trim().split(/\s+/)[0] || "מי שהזמין",
      onSiteNameHe: job.onSiteName,
      quote: job.status === "WAITING_QUOTE_APPROVAL" ? "WAITING" : job.approvedQuoteId ? "APPROVED" : null,
      paidDirectly: app.config.IN_APP_PAYMENTS === "off",
      serviceNameHe: jobServiceNameHe(job),
      serviceCode: job.service.code,
      stage: STAGE[job.status] ?? "coming",
      professional: pro
        ? {
            displayName: pro.displayName,
            photoUrl: face?.photoUrl ?? null,
            portraitKind: face?.portraitKind ?? null,
            addressAs: addressAsView(pro.addressAs),
            // A sandbox check is not a verification (see routes/match.ts).
            verifications: [identityBadge(currentCheck(pro.identityChecks))].filter((b): b is NonNullable<typeof b> => b !== null),
            // The car to look for out of the window, as in the demo's "מגיע ב…"; no plate digits on a shared link.
            vehicleHe: vehicleForCustomer(job.status, pro)?.vehicleHe ?? null,
          }
        : null,
      etaSeconds: pro ? (job.offers[0]?.etaSecondsSnapshot ?? null) : null,
      doorCode: pro ? job.doorCode : null,
    };
    reply.header("cache-control", "no-store");
    return view;
  });
}
