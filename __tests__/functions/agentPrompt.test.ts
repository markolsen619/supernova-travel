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
  it('schema accepts query', () => {
    expect((AGENT_RESPONSE_SCHEMA.properties.operations.items.properties as Record<string, { type: string; description?: string }>).query).toMatchObject({ type: 'STRING' });
    expect((AGENT_RESPONSE_SCHEMA.properties.operations.items.properties as Record<string, { description?: string }>).query.description).toMatch(/addStop/);
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
