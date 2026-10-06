'use client';

/**
 * An email shown on an admin page as it will arrive.
 *
 * Sandboxed, so no script in it runs (a blast's HTML can be anything an
 * admin pasted). Its links open in a new tab, as they would from an inbox:
 * they used to open inside the frame, where the site refuses to be shown
 * (it can't be framed by anyone, against clickjacking), so pressing Book Now
 * in the preview gave Gil a broken page (item 19). The new tab is a normal
 * one, outside the sandbox.
 */
export default function EmailPreview({ html, className, title = 'Email preview' }: { html: string; className?: string; title?: string }) {
  return (
    <iframe
      srcDoc={`<base target="_blank">${html}`}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className={className}
      title={title}
    />
  );
}
