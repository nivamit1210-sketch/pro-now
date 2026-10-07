import type { PrismaClient } from "@prisma/client";
import type { NotificationProvider } from "@pro-now/types";
import type { JobEventNotice } from "../../realtime/job-event-bus.js";
import type { UserEventBus } from "../../realtime/user-event-bus.js";
import { deliveriesFor, type Delivery } from "./policy.js";
import { jobServiceNameHe } from "../job/service-name.js";

/**
 * Turns job events into notifications (docs/21 W9), for every event from
 * every writer (it listens on the job event bus). Nothing here may fail
 * the request that caused the event: every delivery is caught and logged.
 */
const NOTIFIED = new Set([
  "OFFER_SENT",
  "OFFER_ACCEPTED",
  "PRO_EN_ROUTE_REQUESTED",
  "PRO_NEARBY",
  "PRO_ARRIVED_REQUESTED",
  "QUOTE_SENT",
  "QUOTE_APPROVED",
  "SERVICE_COMPLETION_REQUESTED",
  "JOB_CANCELLED",
]);

export interface DispatchDeps {
  prisma: PrismaClient;
  push: NotificationProvider;
  users: UserEventBus;
  log: { warn: (obj: object, msg: string) => void };
}

export async function notifyForJobEvent(deps: DispatchDeps, notice: JobEventNotice): Promise<Delivery[]> {
  if (!NOTIFIED.has(notice.type)) return [];
  const job = await deps.prisma.job.findUnique({
    where: { id: notice.jobId },
    include: {
      service: { select: { nameHe: true } },
      customer: { include: { user: { select: { id: true, email: true } } } },
      assignedProfessional: { select: { userId: true, displayName: true, addressAs: true } },
    },
  });
  if (!job) return [];
  /*
   * Events are announced after their transaction commits (plugins/prisma.ts),
   * so the job read here shows the assignment. The event also names who
   * accepted (actorId); kept as the fallback it was when the announcement
   * came before the commit and the customer was told "המקצוען יצא" with no
   * name and the wrong gender.
   */
  const professional =
    job.assignedProfessional ??
    (notice.type === "OFFER_ACCEPTED" && notice.actorId
      ? await deps.prisma.professionalProfile.findUnique({ where: { id: notice.actorId }, select: { userId: true, displayName: true, addressAs: true } })
      : null);
  const offeredProId = (notice.metadata as { professionalId?: string } | undefined)?.professionalId;
  const offeredTo = offeredProId
    ? await deps.prisma.professionalProfile.findUnique({ where: { id: offeredProId }, select: { userId: true } })
    : null;

  const deliveries = deliveriesFor(notice, {
    jobId: job.id,
    serviceNameHe: jobServiceNameHe(job),
    customer: { userId: job.customer.user.id, email: job.customer.user.email },
    professional,
    offeredTo,
  });

  for (const d of deliveries) {
    const note = { type: notice.type, jobId: job.id, url: d.url };
    try {
      if (d.channels.includes("inapp")) {
        await deps.prisma.notification.create({ data: { userId: d.userId, type: notice.type, jobId: job.id, title: d.titleHe, body: d.bodyHe, data: note } });
        deps.users.publish(d.userId, { type: "NOTIFICATION", title: d.titleHe, body: d.bodyHe, url: d.url, jobId: job.id });
      }
      if (d.channels.includes("socket") && d.offer) deps.users.publish(d.userId, { type: "OFFER", jobId: job.id, url: d.url });
      if (d.channels.includes("email") && d.email) {
        await deps.prisma.emailOutbox.create({
          data: {
            toEmail: d.email,
            subject: `PRO NOW · ${d.titleHe}`,
            text: `${d.titleHe}\n${d.bodyHe}`,
            html: `<div dir="rtl" style="font-family:sans-serif"><h2>${escape(d.titleHe)}</h2><p>${escape(d.bodyHe)}</p></div>`,
          },
        });
      }
      if (d.channels.includes("push")) {
        await deps.push.sendPush({ userId: d.userId, title: d.titleHe, body: d.bodyHe, data: { url: d.url } });
      }
    } catch (err) {
      deps.log.warn({ err: (err as Error).message, type: notice.type, jobId: job.id }, "notification delivery failed");
    }
  }
  return deliveries;
}

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
