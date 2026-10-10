'use client';

import { useEffect, useState } from 'react';

/**
 * Is the screen narrower than a tablet? Lists that are tables on a computer
 * show as cards on a phone (bookings, events, members, venues), where a
 * table's last columns (Status, Edit, Manage) sat off the side of the screen.
 *
 * One layout is drawn at a time, never both: false until the page is running
 * in the browser, which is before these lists have loaded their rows.
 */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}
