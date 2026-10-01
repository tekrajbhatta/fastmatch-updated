import { Container, PageLoader } from '@/components/site/layout';

// Shown the moment a link is followed, while the next page is rendered on the
// server (every page is rendered per request, since the header depends on who
// is logged in). The header and footer stay put; only the page area swaps.
export default function Loading() {
  return (
    <Container>
      <PageLoader />
    </Container>
  );
}
