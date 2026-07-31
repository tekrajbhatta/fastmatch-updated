export function emailLayout(bodyHtml: string, opts: { unsubscribeUrl?: string } = {}) {
  const year = new Date().getFullYear();
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="padding:20px 0;border-bottom:1px solid #eee;">
    <span style="font-style:italic;font-weight:800;font-size:1.4rem;">
      <span style="color:#3D1E6D;">fast</span><span style="color:#A4CE39;">match</span>
    </span>
    <div style="color:#8A8A8A;font-size:0.75rem;">Connecting People Face to Face</div>
  </div>

  <div style="padding:24px 0;">
    ${bodyHtml}
  </div>

  <div style="background:#3D1E6D;color:#fff;padding:20px;font-size:0.75rem;text-align:center;">
    <div>&copy; ${year} FastMatch — Connecting people face to face. All rights reserved.</div>
    <div style="margin-top:6px;">Email: info@fastmatch.com.au</div>
    ${
      opts.unsubscribeUrl
        ? `<div style="margin-top:6px;">Unsubscribe — <a href="${opts.unsubscribeUrl}" style="color:#fff;">${opts.unsubscribeUrl}</a></div>`
        : ''
    }
  </div>
</div>`;
}
