import { BRAND_NAME, BRAND_TAGLINE, BRAND_COLORS } from '../brand';

export function emailLayout(bodyHtml: string, opts: { unsubscribeUrl?: string } = {}) {
  const year = new Date().getFullYear();
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="padding:20px 0;border-bottom:1px solid #eee;">
    <span style="font-style:italic;font-weight:800;font-size:1.4rem;">
      <span style="color:${BRAND_COLORS.plum};">fast</span><span style="color:${BRAND_COLORS.green};">match</span>
    </span>
    <div style="color:#8A8A8A;font-size:0.75rem;">${BRAND_TAGLINE}</div>
  </div>

  <div style="padding:24px 0;">
    ${bodyHtml}
  </div>

  <div style="background:${BRAND_COLORS.plum};color:#fff;padding:20px;font-size:0.75rem;text-align:center;">
    <div>&copy; ${year} ${BRAND_NAME} — ${BRAND_TAGLINE}. All rights reserved.</div>
    <div style="margin-top:6px;">Email: info@fastmatch.com.au</div>
    ${
      opts.unsubscribeUrl
        ? `<div style="margin-top:6px;">Unsubscribe — <a href="${opts.unsubscribeUrl}" style="color:#fff;">${opts.unsubscribeUrl}</a></div>`
        : ''
    }
  </div>
</div>`;
}
