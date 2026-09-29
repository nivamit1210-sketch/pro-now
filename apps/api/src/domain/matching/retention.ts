/**
 * What a customer typed is personal data, kept 4 days (docs/21 §5 D3,
 * the same period as photos and voice), then deleted.
 */
export const MATCH_FEEDBACK_RETENTION_MS = 4 * 24 * 60 * 60 * 1000;

export interface MatchFeedbackStore {
  matchFeedback: { deleteMany(args: { where: { createdAt: { lt: Date } } }): Promise<{ count: number }> };
}

export async function purgeMatchFeedback(store: MatchFeedbackStore, now = new Date()): Promise<number> {
  const { count } = await store.matchFeedback.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - MATCH_FEEDBACK_RETENTION_MS) } },
  });
  return count;
}
