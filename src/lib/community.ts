import type { Pattern } from '../types';
import { client, cloudEnabled, getCloud } from './cloud';
import { decodeShare, encodeShare } from './share';
import { computeStats } from './stats';
import { listPatterns, savePattern } from './storage';
import { uid } from './threads';
import { t } from './i18n';

/**
 * Community gallery ("ลายจากชุมชน"): patterns people chose to share publicly.
 * Tables and permissions: supabase/migrations/0003_community.sql · design: docs/community-gallery.md
 *
 * Browsing works signed out; sharing, likes and "my shared patterns" need an account.
 * A shared post is a snapshot (encodeShare: no progress); the local pattern remembers it as `postId`.
 */
export const communityEnabled = cloudEnabled;

export type PostBase = 'aida' | 'print3d';
export type PostSort = 'new' | 'popular';
export type ReportReason = 'copyright' | 'inappropriate' | 'spam' | 'other';

export const TAGS: { id: string; label: () => string }[] = [
  { id: 'animals', label: () => t('สัตว์', 'Animals') },
  { id: 'flowers', label: () => t('ดอกไม้ ต้นไม้', 'Flowers & plants') },
  { id: 'cute', label: () => t('การ์ตูน น่ารัก', 'Cute & cartoon') },
  { id: 'characters', label: () => t('ตัวละคร', 'Characters') },
  { id: 'letters', label: () => t('ตัวอักษร ชื่อ', 'Letters & names') },
  { id: 'festival', label: () => t('เทศกาล', 'Holidays') },
  { id: 'food', label: () => t('อาหาร ขนม', 'Food') },
  { id: 'geometric', label: () => t('ลวดลาย', 'Geometric') },
  { id: 'other', label: () => t('อื่น ๆ', 'Other') },
];
export const tagLabel = (id: string) => TAGS.find((x) => x.id === id)?.label() ?? id;

export interface Post {
  id: string;
  title: string;
  description: string;
  base: PostBase;
  difficulty: 'easy' | 'medium' | 'hard';
  colors: number;
  stitches: number;
  cols: number;
  rows: number;
  templateName: string | null;
  tags: string[];
  data: string;
  remixOf: string | null;
  /** the author lets other shops make this design (0014) */
  allowMaking: boolean;
  /** the lowest price its author's shop sells it for; null = not for sale (0014) */
  forSaleFrom: number | null;
  status: 'published' | 'hidden' | 'removed';
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  author: Author;
}

/** Who shared a post: display name, @username (their profile is #/@username) and badges. */
export interface Author { id: string; name: string; username: string; official: boolean; verified: boolean }

const COLUMNS = 'id, title, description, base, difficulty, colors, stitches, cols, rows, template_name, tags, data, remix_of, status, like_count, created_at, updated_at, author, allow_making, creators(display_name, username, official, verified), post_prices(price_thb)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPost(r: any): Post {
  return {
    id: r.id, title: r.title, description: r.description ?? '', base: r.base, difficulty: r.difficulty,
    colors: r.colors, stitches: r.stitches, cols: r.cols, rows: r.rows, templateName: r.template_name,
    tags: r.tags ?? [], data: r.data, remixOf: r.remix_of, status: r.status, likeCount: r.like_count,
    createdAt: r.created_at, updatedAt: r.updated_at, allowMaking: !!r.allow_making,
    forSaleFrom: r.post_prices?.length ? Math.min(...r.post_prices.map((x: { price_thb: number }) => x.price_thb)) : null,
    author: toAuthor(r.author, r.creators),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAuthor(id: string, c: any): Author {
  return { id, name: c?.display_name ?? t('ไม่ระบุชื่อ', 'Unknown'), username: c?.username ?? '', official: !!c?.official, verified: !!c?.verified };
}

/** Turn database / network errors into something a person can act on. */
function friendly(e: unknown): Error {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (navigator.onLine === false || /Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return new Error(t('ไม่มีอินเทอร์เน็ต ลองใหม่เมื่อออนไลน์', 'You’re offline. Try again when you’re online.'));
  }
  if (/creators_username_format/.test(msg)) return new Error(USERNAME_RULE());
  if (/creators_username/.test(msg)) return new Error(t('มีคนใช้ชื่อผู้ใช้นี้แล้ว ลองชื่ออื่น', 'That username is taken. Try another.'));
  if (/username not allowed/i.test(msg)) return new Error(t('ชื่อผู้ใช้นี้สงวนไว้ ลองชื่ออื่น', 'That username is reserved. Try another.'));
  if (/username changed recently/i.test(msg)) return new Error(t('เปลี่ยนชื่อผู้ใช้ได้ 30 วันครั้ง', 'You can change your username once every 30 days.'));
  if (/name not allowed/i.test(msg)) return new Error(t('ชื่อนี้คล้ายชื่อทีม XStitch.Design ลองชื่ออื่น', 'That name looks like the XStitch.Design team. Try another.'));
  if (/no such creator/i.test(msg)) return new Error(t('ไม่พบผู้ใช้นี้', 'No such user'));
  if (/share limit/i.test(msg)) return new Error(t('วันนี้แชร์ครบ 10 ลายแล้ว พรุ่งนี้แชร์ต่อได้', 'You’ve shared 10 patterns today. You can share more tomorrow.'));
  return new Error(msg);
}

async function run<T>(fn: () => PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  let res;
  try { res = await fn(); } catch (e) { throw friendly(e); }
  if (res.error) throw friendly(res.error);
  return res.data;
}

const PAGE = 24;

/** One page of published posts. */
export async function listPosts(opts: { base?: PostBase; tag?: string; sort?: PostSort; page?: number; limit?: number; author?: string } = {}): Promise<{ posts: Post[]; more: boolean }> {
  const c = await client();
  const limit = opts.limit ?? PAGE;
  const from = (opts.page ?? 0) * limit;
  const rows = await run(() => {
    let q = c.from('posts').select(COLUMNS).eq('status', 'published');
    if (opts.base) q = q.eq('base', opts.base);
    if (opts.tag) q = q.contains('tags', [opts.tag]);
    if (opts.author) q = q.eq('author', opts.author);
    q = opts.sort === 'popular'
      ? q.order('like_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });
    // ask for one extra row to know whether there is another page
    return q.range(from, from + limit);
  });
  const posts = (rows ?? []).map(toPost);
  return { posts: posts.slice(0, limit), more: posts.length > limit };
}

/** A single post (published, or your own hidden one); null when it doesn't exist or was removed. */
export async function getPost(id: string): Promise<Post | null> {
  const c = await client();
  const row = await run(() => c.from('posts').select(COLUMNS).eq('id', id).maybeSingle());
  return row ? toPost(row) : null;
}

/**
 * Link to share a post. On the live site it's /p/<id>, which gives LINE / Facebook a preview with the
 * pattern's picture (api/p.js) and then opens #/c/<id>. The dev server has no functions, so it links straight in.
 */
export function postShareUrl(id: string): string {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  return local ? `${location.origin}${location.pathname}#/c/${id}` : `${location.origin}/p/${id}`;
}

/** The pattern inside a post. */
export function postPattern(post: Post): Promise<Pattern> {
  return decodeShare(post.data).then((p) => ({ ...p, name: post.title }));
}

function me() {
  const u = getCloud().user;
  if (!u) throw new Error(t('ต้องเข้าสู่ระบบก่อน', 'Please sign in first'));
  return u;
}

// ---------- your public name and @username ----------

export interface Creator {
  name: string;
  username: string;
  /** false while the username is one we picked (maker1234): changing it is free */
  usernameChosen: boolean;
  /** when it can next be changed; null = any time */
  usernameLockedUntil: Date | null;
  official: boolean;
  verified: boolean;
}

export const USERNAME_DAYS = 30;
const USERNAME_RE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
const USERNAME_RULE = () => t('ชื่อผู้ใช้ใช้ a–z, 0–9, _ และ . ได้ 3–20 ตัว (ห้ามขึ้นต้นหรือลงท้ายด้วยจุด หรือมีจุดติดกัน)',
  'Usernames use a–z, 0–9, _ and . (3–20 characters, no dot at the start or end, no two dots in a row).');
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'help', 'helpdesk', 'contact', 'info',
  'team', 'staff', 'official', 'verified', 'moderator', 'moderators', 'mod', 'mods',
  'community', 'shop', 'shops', 'account', 'settings', 'api', 'www', 'about', 'terms', 'privacy',
  'order', 'orders', 'null', 'undefined', 'anonymous', 'unknown', 'me', 'you']);

/** Lower-cases and trims what someone typed (and drops a leading @). */
export const cleanUsername = (u: string) => u.trim().replace(/^@/, '').toLowerCase();

/** Why this username can't be used, or null when it can (taken is checked by the database). */
export function usernameProblem(u: string): string | null {
  if (!USERNAME_RE.test(u) || u.includes('..')) return USERNAME_RULE();
  if (u.includes('xstitch') || RESERVED.has(u)) return t('ชื่อผู้ใช้นี้สงวนไว้ ลองชื่ออื่น', 'That username is reserved. Try another.');
  return null;
}

/** Link to someone's profile page. */
export const profileHref = (username: string) => `#/@${username}`;

const CREATOR_COLS = 'display_name, username, username_chosen, username_changed_at, official, verified';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCreator(r: any): Creator {
  const changed = r.username_changed_at ? Date.parse(r.username_changed_at) : 0;
  const until = r.username_chosen && changed ? new Date(changed + USERNAME_DAYS * 86400e3) : null;
  return {
    name: r.display_name, username: r.username, usernameChosen: !!r.username_chosen,
    usernameLockedUntil: until && until.getTime() > Date.now() ? until : null,
    official: !!r.official, verified: !!r.verified,
  };
}

export async function getMyCreator(): Promise<Creator | null> {
  const u = me();
  const c = await client();
  const row = await run(() => c.from('creators').select(CREATOR_COLS).eq('user_id', u.id).maybeSingle());
  return row ? toCreator(row) : null;
}

/** Sets your display name (and, when given, your @username); creates your public identity the first time. */
export async function saveMyCreator(name: string, username?: string): Promise<Creator> {
  const u = me();
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error(t('ใส่ชื่อที่แสดงก่อน', 'Enter a display name first'));
  const handle = username === undefined ? undefined : cleanUsername(username);
  if (handle !== undefined) {
    const bad = usernameProblem(handle);
    if (bad) throw new Error(bad);
  }
  const c = await client();
  const existing = await getMyCreator();
  const changes: { display_name: string; username?: string } = { display_name: clean };
  if (handle !== undefined && handle !== existing?.username) changes.username = handle;
  const row = existing
    ? await run(() => c.from('creators').update(changes).eq('user_id', u.id).select(CREATOR_COLS).single())
    : await run(() => c.from('creators').insert({ user_id: u.id, ...changes }).select(CREATOR_COLS).single());
  return toCreator(row);
}

/** Whether a username is free (the database has the last word when saving). */
export async function usernameTaken(username: string): Promise<boolean> {
  const c = await client();
  const row = await run(() => c.from('creators').select('user_id').eq('username', username).maybeSingle());
  const mine = getCloud().user?.id;
  return !!row && (row as { user_id: string }).user_id !== mine;
}

export interface Profile extends Author { since: string; shop: { id: number; name: string } | null }

/** A public profile by @username; null when there is no such user. */
export async function getProfile(username: string): Promise<Profile | null> {
  const c = await client();
  const row = await run(() => c.from('creators').select('user_id, display_name, username, official, verified, created_at')
    .eq('username', cleanUsername(username)).maybeSingle());
  if (!row) return null;
  const r = row as { user_id: string; created_at: string };
  const shops = await run(() => c.from('shops').select('id, name').eq('owner_id', r.user_id).eq('suspended', false).limit(1));
  const shop = (shops as { id: number; name: string }[] | null)?.[0] ?? null;
  return { ...toAuthor(r.user_id, row), since: r.created_at, shop };
}

/** Moderators give or take back the verified badge. */
export async function setVerified(username: string, on: boolean): Promise<void> {
  const c = await client();
  await run(() => c.rpc('set_creator_verified', { p_username: username, p_on: on }));
}

// ---------- sharing ----------

export interface PublishMeta { title: string; description: string; tags: string[] }

/** Facts shown on cards, worked out from the pattern itself. */
function facts(p: Pattern) {
  const st = computeStats(p);
  return {
    base: (p.details.baseType === 'print3d' || p.mode === 'template' ? 'print3d' : 'aida') as PostBase,
    difficulty: p.details.difficulty,
    colors: Math.max(1, st.colors.filter((c) => c.count > 0).length),
    stitches: st.total,
    cols: p.cols, rows: p.rows,
    template_name: p.templateName ?? null,
  };
}

/** Why a pattern can't be shared yet, or null when it can. */
export function cannotShare(p: Pattern): string | null {
  if (computeStats(p).total === 0) return t('ลายนี้ยังว่างอยู่ ลงสีก่อนค่อยแชร์', 'This pattern is still empty. Add some stitches first.');
  return null;
}

/** Your own post for this pattern, if it was shared from this account and still exists. */
export async function myPostFor(p: Pattern): Promise<Post | null> {
  if (!p.postId) return null;
  const u = me();
  const post = await getPost(p.postId);
  return post && post.author.id === u.id ? post : null;
}

/** Share a pattern, or replace the post it was shared as. Returns the saved pattern and the post id. */
export async function publishPattern(p: Pattern, meta: PublishMeta, replace: boolean): Promise<{ postId: string; pattern: Pattern }> {
  const u = me();
  const c = await client();
  const title = meta.title.trim().slice(0, 80) || p.name;
  const fields = {
    ...facts(p),
    title,
    description: meta.description.trim().slice(0, 1000),
    tags: meta.tags.slice(0, 3),
    data: await encodeShare({ ...p, name: title }),
  };
  let postId: string;
  if (replace && p.postId) {
    await run(() => c.from('posts').update(fields).eq('id', p.postId!).eq('author', u.id));
    postId = p.postId;
  } else {
    const row = await run(() => c.from('posts').insert({ ...fields, author: u.id, remix_of: p.remixOf?.id ?? null }).select('id').single());
    postId = (row as { id: string }).id;
  }
  // remember the link on the local pattern (syncs to the account like any other edit)
  const pattern = { ...p, postId, updatedAt: Date.now() };
  savePattern(pattern);
  return { postId, pattern };
}

/** Take a post down for good (the row is deleted, not hidden). */
export async function unpublish(postId: string): Promise<void> {
  const u = me();
  const c = await client();
  await run(() => c.from('posts').delete().eq('id', postId).eq('author', u.id));
  // forget the link on any local pattern that pointed to it
  for (const p of listPatterns()) if (p.postId === postId) savePattern({ ...p, postId: undefined, updatedAt: Date.now() });
}

export async function myPosts(): Promise<Post[]> {
  const u = me();
  const c = await client();
  const rows = await run(() => c.from('posts').select(COLUMNS).eq('author', u.id).order('created_at', { ascending: false }));
  return (rows ?? []).map(toPost);
}

/** Everything about you in the community tables, for "Download my data". */
export async function myCommunityData(): Promise<{ creator: Creator | null; posts: Omit<Post, 'data'>[] }> {
  const [creator, posts] = await Promise.all([getMyCreator(), myPosts()]);
  return { creator, posts: posts.map(({ data: _data, ...rest }) => rest) };
}

// ---------- likes ----------

/** Which of these posts you have liked (empty when signed out). */
export async function myLikes(ids: string[]): Promise<Set<string>> {
  const u = getCloud().user;
  if (!u || !ids.length) return new Set();
  const c = await client();
  const rows = await run(() => c.from('post_likes').select('post_id').eq('user_id', u.id).in('post_id', ids));
  return new Set(((rows ?? []) as { post_id: string }[]).map((r) => r.post_id));
}

export async function setLike(postId: string, on: boolean): Promise<void> {
  const u = me();
  const c = await client();
  if (on) {
    await run(() => c.from('post_likes').upsert({ post_id: postId, user_id: u.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true }));
  } else {
    await run(() => c.from('post_likes').delete().eq('post_id', postId).eq('user_id', u.id));
  }
}

// ---------- reports ----------

export async function reportPost(postId: string, reason: ReportReason, note: string): Promise<void> {
  const c = await client();
  const u = getCloud().user;
  await run(() => c.from('post_reports').insert({ post_id: postId, reason, note: note.trim().slice(0, 1000), reporter: u?.id ?? null }));
}

// ---------- taking a copy ----------

/** The local copy previously taken from this post, if any (so "Stitch it" twice doesn't make two). */
export function localCopyOf(postId: string): Pattern | undefined {
  return listPatterns().find((p) => p.remixOf?.id === postId && !p.postId);
}

/** A post as a new local pattern that credits the original, not saved yet. */
export async function buildCopy(post: Post): Promise<Pattern> {
  const p = await postPattern(post);
  const now = Date.now();
  return {
    ...p, id: uid(), createdAt: now, updatedAt: now, postId: undefined,
    remixOf: { id: post.id, title: post.title, author: post.author.name },
  };
}

/** Save a post as a new local pattern that credits the original ("Edit as my copy"). */
export async function takeCopy(post: Post): Promise<Pattern> {
  const copy = await buildCopy(post);
  if (!savePattern(copy)) throw new Error(t('บันทึกไม่สำเร็จ พื้นที่ในเบราว์เซอร์อาจเต็ม', 'Could not save. Browser storage may be full.'));
  return copy;
}
