import { ApiError, handler, json, requireUserId } from '@/lib/api/route-context';
import { bodyString, readJsonBody } from '@/lib/api/params';
import type { ReportReason, ReportSubjectKind } from '@citizens-wear/db';

export const dynamic = 'force-dynamic';

const SUBJECT_KINDS: readonly ReportSubjectKind[] = ['post', 'comment', 'message', 'story', 'user'];
const REASONS: readonly ReportReason[] = ['spam', 'abuse', 'sexual', 'self_harm', 'illegal', 'other'];

/** POST /api/reports { subjectKind, subjectId, reason, note? } — file a report. */
export const POST = handler(async (req, ctx) => {
  const userId = requireUserId(ctx);
  const body = await readJsonBody(req);
  const subjectKind = bodyString(body, 'subjectKind') as ReportSubjectKind;
  const subjectId = bodyString(body, 'subjectId');
  const reasonRaw = bodyString(body, 'reason') as ReportReason;
  if (!subjectId) throw new ApiError(400, 'missing_subject', 'A subject id is required.');
  if (!SUBJECT_KINDS.includes(subjectKind)) {
    throw new ApiError(400, 'invalid_subject_kind', 'Unknown subject kind.');
  }
  const reason = REASONS.includes(reasonRaw) ? reasonRaw : 'other';
  const report = await ctx.store.reports.create({
    reporterId: userId,
    subjectKind,
    subjectId,
    reason,
    note: bodyString(body, 'note') || null,
  });
  return json({ id: report.id }, 201);
});
