/**
 * The itinerary's response schema (2026-11-12). Without one, gemini-3.5-flash-lite sometimes dropped a key mid-answer
 * ("dayNumber": 5: "Coyoacán…") and generation failed to parse; a schema constrains the output to this shape. Gemini
 * sends only required fields, so every field tripDocuments() reads is required. The prompt still describes each field.
 * Pure — no firebase-admin.
 */
export function generatedTripSchema(multiCity: boolean): object {
  const stop = {
    type: 'OBJECT',
    properties: {
      type: { type: 'STRING', enum: ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'free'] },
      title: { type: 'STRING' },
      address: { type: 'STRING', nullable: true },
      rationale: { type: 'STRING' },
      searchQuery: { type: 'STRING' },
      notes: { type: 'STRING' },
      cost: { type: 'NUMBER', nullable: true },
      currency: { type: 'STRING', nullable: true },
    },
    required: ['type', 'title', 'address', 'rationale', 'searchQuery', 'notes', 'cost', 'currency'],
    propertyOrdering: ['type', 'title', 'address', 'rationale', 'searchQuery', 'notes', 'cost', 'currency'],
  };
  const day = {
    type: 'OBJECT',
    properties: {
      dayNumber: { type: 'INTEGER' },
      title: { type: 'STRING' },
      notes: { type: 'STRING' },
      activities: { type: 'ARRAY', items: stop },
    },
    required: ['dayNumber', 'title', 'notes', 'activities'],
    propertyOrdering: ['dayNumber', 'title', 'notes', 'activities'],
  };
  const top = ['title', 'description', ...(multiCity ? ['region'] : []), 'days'];
  return {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      description: { type: 'STRING' },
      ...(multiCity ? { region: { type: 'STRING' } } : {}),
      days: { type: 'ARRAY', items: day },
    },
    required: top,
    propertyOrdering: top,
  };
}
