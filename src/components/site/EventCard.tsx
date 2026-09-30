import Link from 'next/link';
import type { ReactNode } from 'react';
import { Tag } from '@/components/site/layout';

/**
 * One event in the Upcoming Events grid. The whole card is one link. Title
 * and venue wrap freely; the date + ages block is pinned to the bottom so
 * cards in a row line up. The trailing "(Sydney time)" never breaks
 * mid-phrase.
 */
export default function EventCard({
  href, tag, title, venue, date, zone, ages, badge,
}: {
  href: string;
  tag: ReactNode;
  title: ReactNode;
  venue: ReactNode;
  /** e.g. "Thu, 1 Oct, 7:30 pm" */
  date: ReactNode;
  /** e.g. "(Sydney time)" — kept on one line with the date's end. */
  zone?: ReactNode;
  ages: ReactNode;
  /** Optional marker beside the tag, e.g. "Booked". */
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-card border border-line bg-white p-[clamp(20px,1.8vw,26px)] text-ink-900 transition duration-200 hover:-translate-y-[3px] hover:border-[#CDBEE0] hover:shadow-card focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-plum-700"
    >
      <div className="flex items-start justify-between gap-2">
        <Tag>{tag}</Tag>
        {badge}
      </div>
      <h2 className="mt-4 font-display text-[clamp(24px,2vw,28px)] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-900">{title}</h2>
      <p className="mb-5 mt-2 text-base leading-[1.45] text-ink-600 text-pretty">{venue}</p>
      <div className="mt-auto border-t border-dashed border-[#DCD0C2] pt-4">
        <p className="text-base font-bold leading-[1.4] text-ink-900">
          {date}
          {zone ? <> <span className="whitespace-nowrap">{zone}</span></> : null}
        </p>
        <p className="mt-1 text-sm leading-[1.4] text-ink-600">{ages}</p>
      </div>
    </Link>
  );
}
