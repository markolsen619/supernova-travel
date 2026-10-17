import { AGENT_RESPONSE_SCHEMA, TRIP_SYSTEM_PROMPT } from '../../functions/src/agentPrompt';

describe('Nova prompt (phase 2)', () => {
  it('sets the warm-friend voice and bans the stiff phrases', () => {
    expect(TRIP_SYSTEM_PROMPT).toMatch(/warm/i);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/never say "my apologies"/i);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/never ask where/i);
  });
  it('requires a search query and nearness from distances', () => {
    expect(TRIP_SYSTEM_PROMPT).toMatch(/"query"/);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/km from/);
  });
  // Eval 2026-10-17: Gemini sends only required fields, so each operation has its own variant (anyOf) with its own required fields.
  const variants = AGENT_RESPONSE_SCHEMA.properties.operations.items.anyOf as { properties: { op: { enum: string[] } }; required: string[] }[];
  const variant = (op: string) => variants.find((v) => v.properties.op.enum[0] === op)!;
  it('one schema variant per operation the validators know', () => {
    const ops = variants.map((v) => v.properties.op.enum[0]).sort();
    expect(ops).toEqual(['addCity', 'addPacking', 'addReservation', 'addStop', 'checkPacking', 'linkBooking', 'moveCity', 'moveStop', 'optimizeDay', 'removeCity', 'removePacking', 'removeStop', 'reorderDay', 'setNights', 'shiftDates', 'swapDays', 'unlinkBooking', 'updateBooking', 'updateStop', 'updateTrip']);
  });
  it('a new place always carries its search query', () => {
    expect(variant('addStop').required).toEqual(expect.arrayContaining(['op', 'day', 'title', 'type', 'query']));
  });
  it('a reservation always carries title, date, time and code (null when unknown)', () => {
    expect(variant('addReservation').required).toEqual(expect.arrayContaining(['op', 'type', 'title', 'date', 'time', 'confirmationCode']));
  });
  it('a removal needs only its stop', () => {
    expect(variant('removeStop').required).toEqual(['op', 'stop']);
  });
});

import { polishReply } from '../../functions/src/agentPrompt';

describe('polishReply (eval 2026-10-17: the model kept these despite the prompt)', () => {
  it('drops filler openers', () => {
    expect(polishReply("I can help with that. I've updated the trip title.")).toBe("I've updated the trip title.");
    expect(polishReply("I'm sorry, I don't see a bar called Pennant in your trip.")).toBe("I don't see a bar called Pennant in your trip.");
    expect(polishReply('No problem, I have swapped day 2 and day 3.')).toBe('I have swapped day 2 and day 3.');
    expect(polishReply('My apologies. Fixed it.')).toBe('Fixed it.');
  });
  it('leaves a normal reply alone and never returns empty', () => {
    expect(polishReply("Pennant's a great call, big deck on the boardwalk.")).toBe("Pennant's a great call, big deck on the boardwalk.");
    expect(polishReply('I can help with that.')).toBe('I can help with that.');
  });
});
