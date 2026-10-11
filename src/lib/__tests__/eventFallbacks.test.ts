import { describe, it, expect } from 'vitest';
import { eventDescription, eventPhoto } from '@/lib/eventFallbacks';

/**
 * Upcoming Events shows each event's photo and the opening of its
 * description on its card, and the event's own page shows both in full. An
 * event with no photo or description of its own shows its venue's.
 */
describe('eventPhoto', () => {
  it('is the event’s own photo when it has one', () => {
    expect(eventPhoto({ photoUrl: '/api/uploads/event.jpg', venue: { imageUrl: '/api/uploads/venue.jpg' } })).toBe('/api/uploads/event.jpg');
    expect(eventPhoto({ photoUrl: '/api/uploads/event.jpg', venue: { imageUrl: null } })).toBe('/api/uploads/event.jpg');
  });

  it('is the venue’s picture when the event has no photo', () => {
    expect(eventPhoto({ photoUrl: null, venue: { imageUrl: '/api/uploads/venue.jpg' } })).toBe('/api/uploads/venue.jpg');
    expect(eventPhoto({ photoUrl: '', venue: { imageUrl: '/api/uploads/venue.jpg' } })).toBe('/api/uploads/venue.jpg');
    expect(eventPhoto({ photoUrl: '  ', venue: { imageUrl: '/api/uploads/venue.jpg' } })).toBe('/api/uploads/venue.jpg');
  });

  it('is nothing when neither has one', () => {
    expect(eventPhoto({ photoUrl: null, venue: { imageUrl: null } })).toBeNull();
    expect(eventPhoto({ venue: {} })).toBeNull();
    expect(eventPhoto({ photoUrl: '', venue: { imageUrl: ' ' } })).toBeNull();
  });
});

describe('eventDescription', () => {
  const venue = { description: 'A cosy bar in Surry Hills.' };

  it('is the event’s own description when it has one', () => {
    expect(eventDescription({ description: 'Meet up to 10 singles in one night.', venue })).toBe('Meet up to 10 singles in one night.');
    expect(eventDescription({ description: '  Meet singles.\n\nA drink in hand.  ', venue: { description: null } })).toBe('Meet singles.\n\nA drink in hand.');
  });

  it('is the venue’s description when the event has none, or a blank one', () => {
    expect(eventDescription({ description: null, venue })).toBe('A cosy bar in Surry Hills.');
    expect(eventDescription({ venue })).toBe('A cosy bar in Surry Hills.');
    expect(eventDescription({ description: '', venue })).toBe('A cosy bar in Surry Hills.');
    expect(eventDescription({ description: ' \n ', venue: { description: '  A cosy bar.  ' } })).toBe('A cosy bar.');
  });

  it('is nothing when neither has one', () => {
    expect(eventDescription({ description: null, venue: { description: null } })).toBeNull();
    expect(eventDescription({ venue: {} })).toBeNull();
    expect(eventDescription({ description: '', venue: { description: ' \n ' } })).toBeNull();
  });
});
