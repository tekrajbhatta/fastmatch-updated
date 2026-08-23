import { BRAND_NAME, BRAND_TAGLINE, BRAND_COLORS } from '../brand';

export function emailLayout(bodyHtml: string, opts: { unsubscribeUrl?: string } = {}) {
  const year = new Date().getFullYear();

  // The real logo, matching the site header, rather than a text approximation
  // of it. Email clients can't resolve relative paths, so this has to be an
  // absolute URL; the trailing slash is stripped so an APP_URL ending in "/"
  // doesn't produce "//logo.png".
  //
  // logo.png already contains the tagline, so it is NOT repeated as text
  // below — but it IS in the alt text, because most clients block remote
  // images by default and the alt is all those recipients will see. The font
  // styling on the <img> is deliberate: it styles that alt text.
  const logoSrc = `${(process.env.APP_URL ?? '').replace(/\/+$/, '')}/logo.png`;

  return `
<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND_COLORS.ink};max-width:600px;margin:0 auto;">
  <div style="padding:20px 0;border-bottom:1px solid #eee;">
    <img src="${logoSrc}" width="180" height="55" alt="${BRAND_NAME} — ${BRAND_TAGLINE}"
         style="display:block;width:180px;height:auto;border:0;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:${BRAND_COLORS.plum};" />
  </div>

  <div style="padding:24px 0;">
    ${bodyHtml}
  </div>

  <div style="background:${BRAND_COLORS.plum};color:#fff;padding:20px;font-size:0.75rem;text-align:center;">
    <div>&copy; ${year} ${BRAND_NAME} — ${BRAND_TAGLINE}. All rights reserved.</div>
    <div style="margin-top:6px;">Email: <a href="mailto:gil@fastmatch.com.au" style="color:#fff;text-decoration:underline;">gil@fastmatch.com.au</a></div>
    ${
      opts.unsubscribeUrl
        ? `<div style="margin-top:6px;">Unsubscribe — <a href="${opts.unsubscribeUrl}" style="color:#fff;">${opts.unsubscribeUrl}</a></div>`
        : ''
    }
  </div>
</div>`;
}
