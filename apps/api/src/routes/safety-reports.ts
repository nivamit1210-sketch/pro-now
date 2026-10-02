import type { FastifyInstance } from "fastify";
import { adminTicketHandledSchema, safetyReportSchema } from "@pro-now/validation";
import { EMERGENCY_POLICE_NUMBER, SAFETY_REASON_HE, SAFETY_RECEIVED_HE, type SafetyReportReason } from "@pro-now/types";
import { customerJob, notFound, requireRole } from "../auth/access.js";
import { jobServiceNameHe } from "../domain/job/service-name.js";
import { REPORTS_PER_JOB_MAX, SAME_REPORT_WINDOW_MS, safetyAlertHtml, safetySubjectHe } from "../domain/safety-report.js";

/**
 * "משהו לא נראה לי תקין" (audit v2 #8b; see domain/safety-report.ts).
 *
 * The customer's report: only on their own job (anyone else gets the same
 * 404 as a job that does not exist), only once somebody was sent to them,
 * at most REPORTS_PER_JOB_MAX times per job, and the same report sent
 * again within SAME_REPORT_WINDOW_MS is the first one. Those two are what
 * keep the unthrottled ops alert from being a way to flood the channel.
 *
 * The admin's queue: every route requires ADMIN; closing a report says
 * what was done, and writes audit_logs and the job's timeline.
 */
export default async function safetyReportRoutes(app: FastifyInstance) {
  app.post("/v1/jobs/:id/safety-report", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = safetyReportSchema.parse(req.body);
    const userId = req.user!.userId;
    const job = await customerJob(app.prisma, userId, id, {
      service: true,
      assignedProfessional: { select: { id: true, displayName: true } },
    });
    if (!job) return notFound(reply, "JOB");
    if (!job.assignedProfessional) {
      return reply.status(409).send({ code: "NO_PROFESSIONAL_YET", message: "Nobody has been sent to this job yet" });
    }
    // A double tap, or a retry after a dropped answer, is the same report: no second ticket, no second alert.
    const same = await app.prisma.supportTicket.findFirst({
      where: { jobId: id, userId, kind: "SAFETY", reason: body.reason, noteHe: body.note, createdAt: { gte: new Date(Date.now() - SAME_REPORT_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
    });
    if (same) return reply.status(200).send({ ticketId: same.id, receivedHe: SAFETY_RECEIVED_HE, replayed: true });
    const already = await app.prisma.supportTicket.count({ where: { jobId: id, userId, kind: "SAFETY" } });
    if (already >= REPORTS_PER_JOB_MAX) {
      return reply.status(429).send({
        code: "SAFETY_REPORT_LIMIT",
        message: `כבר קיבלנו ממך כמה דיווחים על הקריאה הזו. בסכנה מיידית: משטרה ${EMERGENCY_POLICE_NUMBER}.`,
      });
    }

    const reason = body.reason as SafetyReportReason;
    const ticket = await app.prisma.$transaction(async (tx) => {
      const t = await tx.supportTicket.create({
        data: {
          kind: "SAFETY",
          jobId: id,
          userId,
          subject: safetySubjectHe(reason),
          reason,
          noteHe: body.note,
          professionalId: job.assignedProfessional!.id,
          jobStatus: job.status,
        },
      });
      await tx.jobEvent.create({
        data: { jobId: id, type: "SAFETY_REPORTED", actor: "CUSTOMER", actorId: userId, metadata: { ticketId: t.id, reason }, requestId: req.id },
      });
      return t;
    });

    // Kept first, told second: a failed alert never loses the report (the admin shows it).
    app.monitor.announce(
      safetyAlertHtml({
        environment: app.config.NODE_ENV,
        publicUrl: app.config.PUBLIC_URL,
        ticketId: ticket.id,
        reason,
        note: body.note,
        jobId: id,
        jobStatus: job.status,
        serviceNameHe: jobServiceNameHe(job),
        reporterUserId: userId,
        professional: job.assignedProfessional,
      })
    );
    return reply.status(201).send({ ticketId: ticket.id, receivedHe: SAFETY_RECEIVED_HE, replayed: false });
  });

  const admin = { onRequest: requireRole("ADMIN") };

  /** The reports, newest first: OPEN (the default) or HANDLED. */
  app.get("/v1/admin/support-tickets", admin, async (req) => {
    const { status } = req.query as { status?: string };
    const wanted = status === "HANDLED" ? "HANDLED" : "OPEN";
    const [tickets, open] = await Promise.all([
      app.prisma.supportTicket.findMany({ where: { status: wanted }, orderBy: { createdAt: "desc" }, take: 100 }),
      app.prisma.supportTicket.count({ where: { status: "OPEN" } }),
    ]);
    const ids = <K extends "jobId" | "userId" | "professionalId">(k: K) => [...new Set(tickets.map((t) => t[k]).filter((v): v is string => Boolean(v)))];
    const [jobs, users, pros] = await Promise.all([
      app.prisma.job.findMany({ where: { id: { in: ids("jobId") } }, select: { id: true, status: true, catalogServiceNameHe: true, service: { select: { nameHe: true } } } }),
      app.prisma.user.findMany({ where: { id: { in: ids("userId") } }, select: { id: true, name: true, email: true } }),
      app.prisma.professionalProfile.findMany({ where: { id: { in: ids("professionalId") } }, select: { id: true, displayName: true } }),
    ]);
    const job = new Map(jobs.map((j) => [j.id, j]));
    const user = new Map(users.map((u) => [u.id, u]));
    const pro = new Map(pros.map((p) => [p.id, p]));
    return {
      open,
      tickets: tickets.map((t) => {
        const j = t.jobId ? job.get(t.jobId) : undefined;
        const u = user.get(t.userId);
        const p = t.professionalId ? pro.get(t.professionalId) : undefined;
        return {
          id: t.id,
          kind: t.kind,
          status: t.status,
          subject: t.subject,
          reason: t.reason,
          reasonHe: t.reason && t.reason in SAFETY_REASON_HE ? SAFETY_REASON_HE[t.reason as SafetyReportReason] : null,
          noteHe: t.noteHe,
          createdAt: t.createdAt.toISOString(),
          handledAt: t.handledAt?.toISOString() ?? null,
          job: j ? { id: j.id, serviceNameHe: jobServiceNameHe(j), statusAtReport: t.jobStatus, statusNow: j.status } : null,
          reporter: u ? { name: u.name || null, email: u.email } : null,
          professional: p ? { id: p.id, displayName: p.displayName } : null,
        };
      }),
    };
  });

  /** Ops dealt with it: what they did is the reason, in the audit log and on the job's timeline. */
  app.post("/v1/admin/support-tickets/:id/handled", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminTicketHandledSchema.parse(req.body);
    const ticket = await app.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) return reply.status(404).send({ code: "TICKET_NOT_FOUND", message: "No such ticket" });
    if (ticket.status === "HANDLED") return reply.status(409).send({ code: "TICKET_ALREADY_HANDLED", message: "Already handled" });
    const actorId = req.user!.userId;
    const handled = await app.prisma.$transaction(async (tx) => {
      const t = await tx.supportTicket.update({ where: { id }, data: { status: "HANDLED", handledAt: new Date(), handledById: actorId } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "SUPPORT_TICKET_HANDLED",
          targetType: "support_ticket",
          targetId: id,
          beforeJson: { status: ticket.status },
          afterJson: { status: t.status },
          reason: body.reason,
          requestId: req.id,
        },
      });
      if (ticket.jobId) {
        await tx.jobEvent.create({
          data: { jobId: ticket.jobId, type: "SAFETY_REPORT_HANDLED", actor: "OPS", actorId, metadata: { ticketId: id }, requestId: req.id },
        });
      }
      return t;
    });
    return reply.send({ id: handled.id, status: handled.status, handledAt: handled.handledAt!.toISOString() });
  });
}
