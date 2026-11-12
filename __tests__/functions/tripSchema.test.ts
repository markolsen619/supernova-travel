import { generatedTripSchema } from '../../functions/src/tripSchema';

// 2026-11-12: gemini-3.5-flash-lite sometimes dropped a key mid-answer ("dayNumber": 5: "Coyoacán…") and the
// itinerary failed to parse; a response schema constrains the output to the shape. Gemini sends only required
// fields, so every field the writer uses is required.
describe('generatedTripSchema', () => {
  const day = (s: any) => s.properties.days.items;
  const stop = (s: any) => day(s).properties.activities.items;
  it('requires every trip, day and stop field the trip writer reads', () => {
    const s = generatedTripSchema(false) as any;
    expect(s.required).toEqual(expect.arrayContaining(['title', 'description', 'days']));
    expect(day(s).required).toEqual(expect.arrayContaining(['dayNumber', 'title', 'notes', 'activities']));
    expect(stop(s).required).toEqual(expect.arrayContaining(['type', 'title', 'address', 'rationale', 'searchQuery', 'notes', 'cost', 'currency']));
  });
  it('stop types are the six the apps know', () => {
    expect(stop(generatedTripSchema(false) as any).properties.type.enum).toEqual(['flight', 'hotel', 'restaurant', 'activity', 'transport', 'free']);
  });
  it('address, cost and currency may be null', () => {
    const p = stop(generatedTripSchema(false) as any).properties;
    expect(p.address.nullable).toBe(true);
    expect(p.cost.nullable).toBe(true);
    expect(p.currency.nullable).toBe(true);
  });
  it('region is asked for (and required) only on a multi-city trip', () => {
    expect((generatedTripSchema(false) as any).properties.region).toBeUndefined();
    const multi = generatedTripSchema(true) as any;
    expect(multi.properties.region).toEqual({ type: 'STRING' });
    expect(multi.required).toContain('region');
  });
});
