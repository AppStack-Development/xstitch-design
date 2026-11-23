// /p/<id> (rewritten here by vercel.json): a tiny page whose meta tags give LINE / Facebook / X a proper
// preview of a community pattern (title, description, picture), then sends people on to the app at #/c/<id>.
import { SITE, escapeHtml, fetchPost, validId } from './_pattern.js';

const DIFF = { easy: 'ง่าย', medium: 'ปานกลาง', hard: 'ยาก' };

export async function GET(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || url.pathname.split('/').filter(Boolean).pop() || '';
  const target = validId(id) ? `/#/c/${id}` : '/#/community';
  const post = validId(id) ? await fetchPost(id).catch(() => null) : null;

  const title = post ? `${post.title} · XStitch.Design` : 'แกลเลอรีลายปัก · XStitch.Design';
  const by = post?.creators?.display_name ? `โดย ${post.creators.display_name}` : '';
  const facts = post
    ? [post.base === 'print3d' ? (post.template_name || 'ชิ้นงาน 3D') : 'ผ้า Aida', DIFF[post.difficulty] ?? '', `${post.colors} สี`, `${Number(post.stitches).toLocaleString('en-US')} ฝีเข็ม`].filter(Boolean).join(' · ')
    : '';
  const description = post
    ? [post.description?.trim(), [by, facts].filter(Boolean).join(' · '), 'เปิดดู ลองปัก หรือแก้เป็นลายของคุณได้ฟรี'].filter(Boolean).join(' — ').slice(0, 300)
    : 'ลายปักครอสติชที่ผู้ใช้ XStitch.Design แชร์ไว้ ลองปักหรือแก้เป็นลายของคุณได้ฟรี';
  // the image URL changes when the pattern is updated, so previews refresh
  const image = post ? `${SITE}/api/og?id=${id}&v=${encodeURIComponent(post.updated_at ?? '')}` : `${SITE}/og-image.png`;
  const canonical = post ? `${SITE}/p/${id}` : `${SITE}/#/community`;

  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="XStitch.Design">
<meta property="og:locale" content="th_TH">
<meta property="og:title" content="${escapeHtml(post ? post.title : 'แกลเลอรีลายปัก')}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(post ? `ลายปัก ${post.title}` : 'XStitch.Design')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(post ? post.title : 'แกลเลอรีลายปัก')}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(target)}">
<script>location.replace(${JSON.stringify(target)})</script>
</head>
<body style="font-family:system-ui,sans-serif;padding:24px">
<p>กำลังเปิดลาย… <a href="${escapeHtml(target)}">แตะที่นี่ถ้าไม่เปิดเอง</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // previews may be a few minutes behind an edit; the app itself always loads fresh data
      'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
