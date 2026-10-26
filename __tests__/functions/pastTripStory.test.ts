import { fallbackStory, parseStory, storyPrompt, validateStoryRequest } from '../../functions/src/pastTripStory';

const req = { requestId: 'abcdefghij1234567890', cities: ['Lisbon'], days: [
  { day: '2025-05-03', city: 0, stops: [{ name: 'Alfama', time: '10:00' }, { name: 'Time Out Market', time: '13:10' }] },
  { day: '2025-05-04', city: 0, stops: [] },
] };

describe('pastTripStory', () => {
  it('accepts a well-formed request', () => {
    expect(validateStoryRequest(req)).toEqual(req);
  });
  it('refuses coordinates, oversize trips and bad shapes', () => {
    expect(validateStoryRequest({ ...req, days: [{ ...req.days[0], stops: [{ name: 'X', time: '10:00', lat: 1 }] }] })).toBeNull();
    expect(validateStoryRequest({ ...req, days: Array(61).fill(req.days[1]) })).toBeNull();
    expect(validateStoryRequest({ ...req, cities: [] })).toBeNull();
    expect(validateStoryRequest({ ...req, requestId: 'x' })).toBeNull();
    expect(validateStoryRequest({ ...req, days: [{ day: 'May 3', city: 0, stops: [] }] })).toBeNull();
  });
  it('the prompt carries names and times only', () => {
    const s = storyPrompt(req);
    expect(s).toContain('Time Out Market');
    expect(s).toContain('13:10');
    expect(s).not.toMatch(/-?\d+\.\d{3,}/);
  });
  it('parses an answer, trims to limits, pads or cuts captions to the day count', () => {
    const s = parseStory(JSON.stringify({ title: 'T'.repeat(80), description: 'Hills and tiles. Good food.', dayCaptions: ['Old town'] }), 2)!;
    expect(s.title).toHaveLength(60);
    expect(s.dayCaptions).toEqual(['Old town', '']);
  });
  it('an unreadable answer is null', () => {
    expect(parseStory('nope', 2)).toBeNull();
    expect(parseStory(JSON.stringify({ description: 'x' }), 2)).toBeNull();
  });
  it('fallback: "Trip to {city}", empty captions', () => {
    expect(fallbackStory(req)).toEqual({ title: 'Trip to Lisbon', description: '', dayCaptions: ['', ''] });
  });
});
