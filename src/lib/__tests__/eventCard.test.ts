import { describe, it, expect } from 'vitest';
import { eventCardBlurb, eventCardPhoto } from '@/lib/eventCard';

/**
 * Upcoming Events: each card shows the event's photo and the opening of its
 * description. An event with no photo of its own shows its venue's picture.
 */
describe('eventCardPhoto', () => {
  it('is the event’s own photo when it has one', () => {
    expect(eventCardPhoto({ photoUrl: '/api/uploads/event.jpg', venue: { imageUrl: '/api/uploads/venue.jpg' } })).toBe('/api/uploads/event.jpg');
    expect(eventCardPhoto({ photoUrl: '/api/uploads/event.jpg', venue: { imageUrl: null } })).toBe('/api/uploads/event.jpg');
  });

  it('is the venue’s picture when the event has no photo', () => {
    expect(eventCardPhoto({ photoUrl: null, venue: { imageUrl: '/api/uploads/venue.jpg' } })).toBe('/api/uploads/venue.jpg');
    expect(eventCardPhoto({ photoUrl: '', venue: { imageUrl: '/api/uploads/venue.jpg' } })).toBe('/api/uploads/venue.jpg');
    expect(eventCardPhoto({ photoUrl: '  ', venue: { imageUrl: '/api/uploads/venue.jpg' } })).toBe('/api/uploads/venue.jpg');
  });

  it('is nothing when neither has one', () => {
    expect(eventCardPhoto({ photoUrl: null, venue: { imageUrl: null } })).toBeNull();
    expect(eventCardPhoto({ venue: {} })).toBeNull();
    expect(eventCardPhoto({ photoUrl: '', venue: { imageUrl: ' ' } })).toBeNull();
  });
});

describe('eventCardBlurb', () => {
  it('is the event’s description', () => {
    expect(eventCardBlurb('Meet up to 10 singles in one night.')).toBe('Meet up to 10 singles in one night.');
    expect(eventCardBlurb('  Meet singles.\n\nA drink in hand.  ')).toBe('Meet singles.\n\nA drink in hand.');
  });

  it('is nothing when the event has no description, or a blank one', () => {
    expect(eventCardBlurb(null)).toBeNull();
    expect(eventCardBlurb(undefined)).toBeNull();
    expect(eventCardBlurb('')).toBeNull();
    expect(eventCardBlurb(' \n ')).toBeNull();
  });
});
