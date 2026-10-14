// __tests__/functions/agentModel.test.ts
import { geminiRequestBody, parseModelText, AGENT_MODEL, AGENT_THINKING_BUDGET } from '../../functions/src/agentModel';
import { AGENT_RESPONSE_SCHEMA, TRIP_SYSTEM_PROMPT } from '../../functions/src/agentPrompt';

describe('geminiRequestBody', () => {
  it('asks for JSON in our schema, thinking off, with the system prompt and turns', () => {
    const body = geminiRequestBody({
      system: 'SYS', schema: AGENT_RESPONSE_SCHEMA, thinkingBudget: AGENT_THINKING_BUDGET,
      turns: [{ role: 'user', text: 'hi' }, { role: 'model', text: '{"reply":"hey","operations":[]}' }, { role: 'user', text: 'again' }],
    }) as any;
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SYS' }] });
    expect(body.contents).toHaveLength(3);
    expect(body.contents[2]).toEqual({ role: 'user', parts: [{ text: 'again' }] });
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: AGENT_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
  it('uses the cheap, fast defaults', () => {
    expect(AGENT_MODEL).toBe('gemini-2.5-flash');
    expect(AGENT_THINKING_BUDGET).toBe(0);
  });
});

describe('parseModelText', () => {
  it('reads a reply and operations', () => {
    expect(parseModelText('{"reply":"Done","operations":[{"op":"removeStop","stop":"s1"}]}'))
      .toEqual({ reply: 'Done', operations: [{ op: 'removeStop', stop: 's1' }] });
  });
  it('treats missing operations as none', () => {
    expect(parseModelText('{"reply":"Day 2 looks fine."}')).toEqual({ reply: 'Day 2 looks fine.', operations: [] });
  });
  it('parseModelText rejects non-JSON and missing fields', () => {
    expect(parseModelText('Sure! Here is')).toBeNull();
    expect(parseModelText('{"operations":[]}')).toBeNull();
    expect(parseModelText('{"reply":""}')).toBeNull();
    expect(parseModelText(undefined)).toBeNull();
  });
});

describe('TRIP_SYSTEM_PROMPT', () => {
  it('states the rules the validator relies on', () => {
    expect(TRIP_SYSTEM_PROMPT).toMatch(/only labels that appear/i);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/never set a time unless/i);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/at most 12/i);
  });
});
