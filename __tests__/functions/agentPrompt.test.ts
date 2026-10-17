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
    expect((AGENT_RESPONSE_SCHEMA.properties.operations.items.properties as Record<string, unknown>).query).toEqual({ type: 'STRING' });
  });
});
