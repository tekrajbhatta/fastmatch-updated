'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

/**
 * One event in the Upcoming Events grid. The whole card is one link: a
 * picture with the event type on it, then the name, venue and the opening
 * of the description, and the date + ages row pinned to the bottom so cards
 * in a row line up. Title and venue wrap freely (a long web address breaks
 * rather than running off the card); the trailing "(Sydney time)" never
 * breaks mid-phrase.
 */
export default function EventCard({
  href, tag, title, venue, photo, description, date, zone, ages, badge,
}: {
  href: string;
  tag: ReactNode;
  title: ReactNode;
  venue: ReactNode;
  /** The picture at the top. Without one (or if it fails to load) the card
      shows a plain purple panel of the same size. */
  photo?: { src: string; alt: string } | null;
  /** Shown under the venue, cut off after three lines. Left out when empty. */
  description?: string | null;
  /** e.g. "Thu, 1 Oct, 7:30 pm" */
  date: ReactNode;
  /** e.g. "(Sydney time)" — kept on one line with the date's end. */
  zone?: ReactNode;
  ages: ReactNode;
  /** Optional marker beside the tag, e.g. "Booked". */
  badge?: ReactNode;
}) {
  // The picture's address that failed to load, if any: remembered by address
  // so a card given a different picture later tries again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = !!photo && photo.src !== failedSrc;

  return (
    <Link
      href={href}
      className="flex flex-col rounded-[26px] border border-line bg-white p-2.5 text-ink-900 transition duration-200 hover:-translate-y-1 hover:border-[#CDBEE0] hover:shadow-[0_22px_40px_-24px_rgb(45_24_72_/_.5)] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-plum-700"
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-[18px_18px_18px_4px] bg-plum-900">
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.src}
            alt={photo.alt}
            loading="lazy"
            decoding="async"
            onError={() => setFailedSrc(photo.src)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // No picture: the brand's rings on plum, as in the page's heading.
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
            <div className="absolute bottom-[-38%] right-[-14%] aspect-square w-[62%] rounded-full border-2 border-match-400 opacity-70" />
            <div className="absolute bottom-[-30%] right-[30%] aspect-square w-[46%] rounded-full bg-plum-200/10" />
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="min-w-0 rounded-[999px_999px_999px_4px] bg-white px-3 py-1.5 text-[13px] font-extrabold leading-[1.3] text-plum-700 shadow-[0_6px_14px_-8px_rgb(31_18_51_/_.6)]">
            {tag}
          </span>
          {badge}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-[clamp(12px,1.1vw,16px)] pb-3.5 pt-[18px]">
        <h2 className="font-display text-[clamp(24px,2vw,28px)] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-900 break-words">{title}</h2>
        <p className="mt-1.5 text-[15px] font-semibold leading-[1.45] text-plum-700 text-pretty break-words">{venue}</p>
        {description ? (
          <p className="mt-3 line-clamp-3 text-base leading-[1.55] text-ink-600 text-pretty break-words">{description}</p>
        ) : null}
        <div className="mt-auto pt-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-dashed border-[#DCD0C2] pt-3.5">
            <p className="text-[15px] font-bold leading-[1.4] text-ink-900">
              {date}
              {zone ? <> <span className="whitespace-nowrap">{zone}</span></> : null}
            </p>
            <span className="flex-none rounded-full bg-plum-100 px-2.5 py-1 text-[13px] font-bold leading-[1.3] text-plum-700">{ages}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
