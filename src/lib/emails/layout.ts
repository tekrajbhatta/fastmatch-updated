import { BRAND_NAME, BRAND_TAGLINE, BRAND_COLORS } from '../brand';

/**
 * The one heading style for every email. Each email used to style its own
 * <h1> (or leave it unstyled), so heading sizes differed from email to email.
 * Restated in full because Gmail and Outlook apply their own <h1> defaults.
 */
export const EMAIL_HEADING = `margin:0 0 20px;font-family:Arial,sans-serif;font-size:20px;line-height:1.4;font-weight:bold;color:${BRAND_COLORS.plum};`;
/** A section heading inside an email ("Date matches"); add a color after it. */
export const EMAIL_SUBHEADING = 'margin:24px 0 8px;font-family:Arial,sans-serif;font-size:17px;line-height:1.4;font-weight:bold;';

/**
 * The frame around every email, blasts included (Gil, item 2: "a border
 * around it, so that it would look visually nicer... for all the emails").
 * In the logo's plum, to match the footer, rather than the red Gil marked
 * (the user, 6 Oct: a colour that suits the template). Square corners: a
 * rounded frame only works in some mail programs, and looks broken in others.
 */
export const EMAIL_FRAME = `border:2px solid ${BRAND_COLORS.plum};`;

/**
 * Spacing for the plain paragraphs and lists in an email's body. Some mail
 * programs drop the usual gap between paragraphs, so lines written as a bare
 * <p> ran together there (the booking confirmation, the reminder, the
 * results emails). Only bare tags get it: anything already styled is left
 * exactly as it is.
 */
export function withEmailSpacing(html: string): string {
  return html
    .replace(/<p>/g, '<p style="margin:0 0 16px;">')
    .replace(/<(ol|ul)>/g, '<$1 style="margin:0 0 16px;padding-left:22px;">')
    .replace(/<li>/g, '<li style="margin:0 0 6px;">');
}

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
<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND_COLORS.ink};max-width:600px;margin:0 auto;background-color:#ffffff;${EMAIL_FRAME}">
  <div style="padding:20px 24px;border-bottom:1px solid #eee;">
    <img src="${logoSrc}" width="180" height="55" alt="${BRAND_NAME}, ${BRAND_TAGLINE}"
         style="display:block;width:180px;height:auto;border:0;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:${BRAND_COLORS.plum};" />
  </div>

  <div style="padding:24px;">
    ${withEmailSpacing(bodyHtml)}
  </div>

  <div style="background:${BRAND_COLORS.plum};color:#fff;padding:20px;font-size:0.75rem;text-align:center;">
    <div>&copy; ${year} ${BRAND_NAME}. ${BRAND_TAGLINE}. All rights reserved.</div>
    <div style="margin-top:6px;">Email: <a href="mailto:gil@fastmatch.com.au" style="color:#fff;text-decoration:underline;">gil@fastmatch.com.au</a></div>
    ${
      opts.unsubscribeUrl
        ? `<div style="margin-top:6px;">Unsubscribe: <a href="${opts.unsubscribeUrl}" style="color:#fff;">${opts.unsubscribeUrl}</a></div>`
        : ''
    }
  </div>
</div>`;
}
