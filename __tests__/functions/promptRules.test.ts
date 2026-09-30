// Relative path, not @/: functions/ is a separate npm package and
// promptRules.ts imports no firebase-admin, so it is testable here.
import { resolveTripVisibility, resolveTravelStyles, travelStyleSummary, travelStyleRules, VENUE_NAMING_RULES } from '../../functions/src/promptRules';

describe('resolveTravelStyles', () => {
  it('uses the list when a current client sends one', () => {
    expect(resolveTravelStyles({ travelStyle: 'family', travelStyles: ['family', 'cultural'] })).toEqual(['family', 'cultural']);
  });

  it('falls back to the single style an older client sends', () => {
    expect(resolveTravelStyles({ travelStyle: 'luxury' })).toEqual(['luxury']);
  });

  it('ignores unknown and repeated styles, and never returns none', () => {
    expect(resolveTravelStyles({ travelStyle: 'budget', travelStyles: ['party', 'budget', 'budget'] as never })).toEqual(['budget']);
    expect(resolveTravelStyles({ travelStyle: 'nonsense' as never, travelStyles: [] })).toEqual(['adventure']);
  });
});

describe('travelStyleSummary', () => {
  it('names one style plainly and joins several', () => {
    expect(travelStyleSummary(['adventure'])).toBe('adventure-style');
    expect(travelStyleSummary(['family', 'cultural'])).toBe('family and cultural-style');
    expect(travelStyleSummary(['adventure', 'budget', 'family'])).toBe('adventure, budget and family-style');
  });
});

describe('travelStyleRules', () => {
  it('gives one rule line for a single style', () => {
    expect(travelStyleRules(['family'])).toMatch(/^Travel style rule for this trip: Favor kid-friendly/);
  });

  it('lists every picked style and asks for a blend', () => {
    const text = travelStyleRules(['family', 'cultural']);
    expect(text).toContain('- family:');
    expect(text).toContain('- cultural:');
    expect(text).toMatch(/blend/i);
  });
});

describe('resolveTripVisibility', () => {
  it('keeps the visibility the traveler picked', () => {
    expect(resolveTripVisibility('followers')).toBe('followers');
    expect(resolveTripVisibility('public')).toBe('public');
  });

  it('stays private when an older client sends none, or anything unexpected', () => {
    expect(resolveTripVisibility(undefined)).toBe('private');
    expect(resolveTripVisibility('everyone' as never)).toBe('private');
  });
});

describe('VENUE_NAMING_RULES', () => {
  it('asks for a real named venue in both the title and the searchQuery', () => {
    expect(VENUE_NAMING_RULES).toMatch(/specific, real, currently operating/);
    expect(VENUE_NAMING_RULES).toMatch(/searchQuery/);
    expect(VENUE_NAMING_RULES).toMatch(/Check into/);
  });
});
