import { client, getCloud } from './cloud';
import type { Author, Post, ReportReason } from './community';
import { t } from './i18n';

/**
 * Reviewing community reports in the app (#/moderation). Only accounts listed in public.moderators
 * can read reports or change a post's status; the database enforces that (0004_moderation.sql).
 */

export type Decision = 'kept' | 'hidden' | 'removed';

export interface ReviewReport {
  id: number;
  reason: ReportReason;
  note: string;
  createdAt: string;
  /** reported while signed in (the reporter's identity is never shown) */
  signedIn: boolean;
  resolvedAt: string | null;
  resolution: Decision | null;
}

/** One reported post with its reports. */
export interface ReviewItem {
  post: Pick<Post, 'id' | 'title' | 'status' | 'base' | 'data' | 'createdAt'> & { reportCount: number; author: Author };
  reports: ReviewReport[];
}

export const REASON_LABEL: Record<ReportReason, () => string> = {
  copyright: () => t('ละเมิดลิขสิทธิ์', 'Copyright'),
  inappropriate: () => t('ไม่เหมาะสม', 'Inappropriate'),
  spam: () => t('สแปม / โฆษณา', 'Spam / ads'),
  other: () => t('อื่น ๆ', 'Other'),
};

export const DECISION_LABEL: Record<Decision, () => string> = {
  kept: () => t('ไม่มีปัญหา แสดงตามเดิม', 'No problem, kept visible'),
  hidden: () => t('ซ่อนไว้', 'Hidden'),
  removed: () => t('นำออกแล้ว', 'Removed'),
};

const SELECT = 'id, reason, note, created_at, reporter, resolved_at, resolution, post_id, '
  + 'posts(id, title, status, base, data, created_at, report_count, creators(display_name, username, official, verified))';

async function check<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error((error as { message?: string }).message ?? String(error));
  return data;
}

/** Whether the signed-in account may review reports. */
export async function amModerator(): Promise<boolean> {
  if (getCloud().status !== 'signed-in') return false;
  const c = await client();
  try {
    return !!(await check(c.rpc('is_moderator')));
  } catch {
    return false; // older database without the function: nobody is a moderator
  }
}

/** How many reported patterns wait for a decision (several reports on one pattern count once). */
export async function openPostCount(): Promise<number> {
  const c = await client();
  const rows = await check(c.from('post_reports').select('post_id').is('resolved_at', null).limit(1000));
  return new Set(((rows ?? []) as { post_id: string }[]).map((r) => r.post_id)).size;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function group(rows: any[]): ReviewItem[] {
  const byPost = new Map<string, ReviewItem>();
  for (const r of rows) {
    const p = r.posts;
    if (!p) continue; // the post was deleted by its author; its reports go with it
    let item = byPost.get(p.id);
    if (!item) {
      item = {
        post: {
          id: p.id, title: p.title, status: p.status, base: p.base, data: p.data, createdAt: p.created_at, reportCount: p.report_count,
          author: { id: p.author ?? '', name: p.creators?.display_name ?? '', username: p.creators?.username ?? '', official: !!p.creators?.official, verified: !!p.creators?.verified },
        },
        reports: [],
      };
      byPost.set(p.id, item);
    }
    item.reports.push({
      id: r.id, reason: r.reason, note: r.note ?? '', createdAt: r.created_at, signedIn: !!r.reporter,
      resolvedAt: r.resolved_at, resolution: r.resolution,
    });
  }
  return [...byPost.values()];
}

/** Posts with reports nobody has dealt with yet, oldest report first. */
export async function reviewQueue(): Promise<ReviewItem[]> {
  const c = await client();
  const rows = await check(c.from('post_reports').select(SELECT).is('resolved_at', null).order('created_at', { ascending: true }).limit(500));
  return group(rows ?? []);
}

/** The most recently handled reports, newest first. */
export async function recentlyHandled(limit = 40): Promise<ReviewItem[]> {
  const c = await client();
  const rows = await check(c.from('post_reports').select(SELECT).not('resolved_at', 'is', null).order('resolved_at', { ascending: false }).limit(limit));
  return group(rows ?? []);
}

/** Decide on a reported post: set its status and close all of its open reports. */
export async function decide(postId: string, decision: Decision): Promise<void> {
  const c = await client();
  const status = decision === 'kept' ? 'published' : decision;
  await check(c.from('posts').update({ status }).eq('id', postId));
  await check(c.from('post_reports').update({ resolved_at: new Date().toISOString(), resolution: decision }).eq('post_id', postId).is('resolved_at', null));
}
