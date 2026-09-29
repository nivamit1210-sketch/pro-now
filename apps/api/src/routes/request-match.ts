import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { catalogMatchRules, type RequestClassifier } from "@pro-now/types";
import { matchFeedbackSchema, matchRequestSchema } from "@pro-now/validation";
import { classifyRequest } from "../domain/matching/classify.js";
import { createKeywordClassifier } from "../infra/matching/keyword-classifier.js";

/**
 * Understanding a typed request (docs/21 W5).
 *
 * `POST /v1/match` names the services a sentence could be, how sure that
 * is, and the one question to ask when it is not sure. It never names a
 * professional, and it creates nothing: the customer confirms a service,
 * and only a job created from that confirmation is dispatched.
 *
 * `POST /v1/match/feedback` records what was suggested and what the
 * customer chose, for the admin review (W8) and the golden set. Kept 4
 * days (D3).
 *
 * The sentence itself is never written to the log: it is the customer's
 * own words about their home, their health or their pet.
 */
export default async function requestMatchRoutes(app: FastifyInstance) {
  const chain: RequestClassifier[] = [createKeywordClassifier()];
  const known = new Set(catalogMatchRules.map((r) => r.serviceId));

  // Any signed-in person: a professional may be a customer too.
  const signedIn = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) await reply.status(401).send({ code: "UNAUTHENTICATED", message: "Missing or invalid session" });
  };

  app.post("/v1/match", { onRequest: signedIn, bodyLimit: 4 * 1024 }, async (req) => {
    const { text } = matchRequestSchema.parse(req.body);
    const result = await classifyRequest(chain, text, known);
    req.log.info({ classifier: result.classifier, confidence: result.confidence, candidates: result.candidates.length }, "request matched");
    return result;
  });

  app.post("/v1/match/feedback", { onRequest: signedIn, bodyLimit: 8 * 1024 }, async (req, reply) => {
    const body = matchFeedbackSchema.parse(req.body);
    const unknown = [...body.suggestedServiceIds, ...(body.chosenServiceId ? [body.chosenServiceId] : [])].filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return reply.status(400).send({ code: "UNKNOWN_SERVICE", message: "No such service", fields: unknown.map((id) => ({ path: "serviceId", message: id })) });
    }
    await app.prisma.matchFeedback.create({
      data: {
        userId: req.user!.userId,
        text: body.text,
        suggestedServiceIds: body.suggestedServiceIds,
        chosenServiceId: body.chosenServiceId,
        confidence: body.confidence,
        // The chain that produced suggestions for this deployment.
        classifier: chain.map((c) => c.name).join("+"),
      },
    });
    return reply.status(204).send();
  });
}
