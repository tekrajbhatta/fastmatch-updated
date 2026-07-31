/**
 * Placeholder landing page.
 *
 * The delivered codebase is API routes only — there are no member-facing or
 * admin screens yet (see "What's not written yet" in README.md). This page
 * exists so the dev server has something to serve at `/` and so it's obvious
 * at a glance that the UI is still to be built. Replace it with the real
 * homepage when the front end is started.
 */
export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>FastMatch</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Local development server</p>

      <p>
        The backend API routes are running under <code>/api</code>. No member-facing
        or admin screens have been built yet — this placeholder stands in for the
        real homepage.
      </p>
    </main>
  );
}
