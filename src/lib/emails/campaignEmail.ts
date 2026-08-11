import { BRAND_COLORS } from '../brand';

/**
 * Resolves what a campaign should actually send: the raw emailBody override
 * if one's explicitly set (e.g. someone pasted their own HTML, bypassing
 * the structured fields), otherwise renders the campaign's own structured
 * fields (heading/freeText/eventDetailsText/bookingLink/photoUrl) — the
 * normal path, since that's what "load a template then tweak the photo for
 * this blast" actually edits. Matches FastmatchLive's pattern.
 */
export function resolveCampaignEmailHtml(
  campaign: {
    emailBody?: string | null;
    heading?: string | null;
    freeText?: string | null;
    eventDetailsText?: string | null;
    bookingLink?: string | null;
    photoUrl?: string | null;
    bannerImageUrl?: string | null;
  },
  unsubscribeUrl: string
) {
  if (campaign.emailBody) return campaign.emailBody;
  return renderCampaignEmailHtml({
    heading: campaign.heading,
    freeText: campaign.freeText,
    eventDetailsText: campaign.eventDetailsText,
    bookingLink: campaign.bookingLink,
    photoUrl: campaign.photoUrl,
    bannerImageUrl: campaign.bannerImageUrl,
    unsubscribeUrl,
  });
}

// Campaign/marketing emails get their own richer banner and footer than the
// plain single-line wordmark used on transactional emails — a marketing
// email should look like an event invitation, not a receipt.
//
// bannerImageUrl, when set, REPLACES the entire default banner with a
// full-width custom image (e.g. a themed frame for a specific blast) — not
// layered underneath or behind it. Text-over-image via CSS positioning
// isn't reliably supported across email clients (Outlook especially), so
// any wordmark/branding the banner needs has to be baked into the uploaded
// image itself, same as any real marketing-email banner graphic. A rebrand
// doesn't touch already-uploaded banner images — those need re-uploading
// with new artwork; only the default fallback below updates automatically
// from brand.ts.
function campaignBanner(bannerImageUrl?: string | null) {
  if (bannerImageUrl) {
    return `<img src="${bannerImageUrl}" alt="" style="width:100%;display:block;" />`;
  }
  return `
    <div style="background-color:${BRAND_COLORS.plum};padding:32px 24px 24px;text-align:center;">
      <span style="font-style:italic;font-weight:800;font-size:28px;">
        <span style="color:#fff;">fast</span><span style="color:${BRAND_COLORS.green};">match</span>
      </span>
    </div>
    <div style="height:6px;background-color:${BRAND_COLORS.green};"></div>`;
}

function campaignFooter(unsubscribeUrl: string) {
  return `
    <div style="background-color:${BRAND_COLORS.plumDark};color:#fff;text-align:center;padding:24px;font-size:12px;line-height:1.7;margin-top:8px;">
      <p style="margin:0;">&copy; ${new Date().getFullYear()} fastmatch. All rights reserved.</p>
      <p style="margin:4px 0 0;">
        <a href="mailto:gil@fastmatch.com.au" style="color:#fff;text-decoration:underline;">Contact us</a>
        &nbsp;&middot;&nbsp;
        <a href="${unsubscribeUrl}" style="color:#fff;text-decoration:underline;">Unsubscribe</a>
      </p>
    </div>`;
}

// Renders a campaign/template's structured fields into the full branded
// layout: banner -> heading -> free-text paragraphs -> optional photo ->
// optional event-details block -> optional Book Now button -> footer.
export function renderCampaignEmailHtml(fields: {
  heading?: string | null;
  freeText?: string | null;
  eventDetailsText?: string | null;
  bookingLink?: string | null;
  photoUrl?: string | null;
  bannerImageUrl?: string | null;
  unsubscribeUrl: string;
}) {
  const paragraphs = (fields.freeText || '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p style="margin:0 0 14px;">${line}</p>`)
    .join('');

  const eventDetailsHtml = fields.eventDetailsText
    ? `<div style="background-color:${BRAND_COLORS.cream};border-left:4px solid ${BRAND_COLORS.green};border-radius:8px;padding:16px 20px;margin:18px 0;white-space:pre-line;font-size:14px;">${fields.eventDetailsText}</div>`
    : '';

  const photoHtml = fields.photoUrl
    ? `<img src="${fields.photoUrl}" alt="" style="width:100%;border-radius:12px;margin:18px 0;display:block;" />`
    : '';

  const bookingButtonHtml = fields.bookingLink
    ? `<p style="text-align:center;"><a href="${fields.bookingLink}" style="background:${BRAND_COLORS.redCta};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Book Now</a></p>`
    : '';

  return `
    <div style="max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:${BRAND_COLORS.ink};line-height:1.6;background-color:#ffffff;">
      ${campaignBanner(fields.bannerImageUrl)}
      <div style="padding:24px 24px 8px;">
        ${fields.heading ? `<h1 style="color:${BRAND_COLORS.plum};font-size:20px;text-align:center;margin:0 0 20px;line-height:1.4;">${fields.heading.split('\n').filter((l) => l.trim()).join('<br/>')}</h1>` : ''}
        ${paragraphs}
        ${eventDetailsHtml}
        ${photoHtml}
        ${bookingButtonHtml}
      </div>
      ${campaignFooter(fields.unsubscribeUrl)}
    </div>`;
}

// Legacy simple path — still used where a campaign only has a plain
// bodyHtml override and no structured fields (e.g. free-text-only blasts).
export function campaignEmail(opts: { subject: string; bodyHtml: string; unsubscribeUrl: string }) {
  return {
    subject: opts.subject,
    html: resolveCampaignEmailHtml({ emailBody: opts.bodyHtml }, opts.unsubscribeUrl),
  };
}
