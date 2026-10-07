'use client';

import { Button } from '@/components/site/button';
import { FormError } from '@/components/site/form';
import { NETWORK_ERROR } from '@/lib/networkError';

/**
 * In place of a page (or part of one) whose first load couldn't reach the
 * site: says so, with a way to try again, instead of "Loading…" for good.
 */
export default function LoadFailed() {
  return (
    <div className="flex flex-col gap-3">
      <FormError>{NETWORK_ERROR}</FormError>
      <Button type="button" variant="secondary" onClick={() => window.location.reload()} block>Try again</Button>
    </div>
  );
}
