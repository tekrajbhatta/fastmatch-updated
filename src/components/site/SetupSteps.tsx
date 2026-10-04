import Link from 'next/link';
import { linkClass } from '@/components/site/button';
import { setupStepLink, type SetupStep } from '@/lib/accountSetup';

/**
 * What's still to do before booking, each with its link — under the event
 * page's notice and under a refused booking.
 */
export default function SetupSteps({ steps, next }: { steps: SetupStep[]; next: string }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {steps.map((s) => {
        const { text, label, href } = setupStepLink(s, next);
        return (
          <li key={s}>
            {text} <Link href={href} className={linkClass}>{label}</Link>
          </li>
        );
      })}
    </ul>
  );
}
