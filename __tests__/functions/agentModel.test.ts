// __tests__/functions/agentModel.test.ts
import { generate, geminiRequestBody, parseModelText, AGENT_MODEL, AGENT_THINKING_BUDGET } from '../../functions/src/agentModel';
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
    // Eval 2026-10-15: without this, Flash answered change requests with "What would you like?" and no operations.
    expect(TRIP_SYSTEM_PROMPT).toMatch(/decide the specifics yourself/i);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/do not ask/i);
    // Eval 2026-10-15: replies said "d2" and "s7" — labels are for operations only.
    expect(TRIP_SYSTEM_PROMPT).toMatch(/never write a label in "reply"/i);
    // Eval 2026-10-15: "Add a day trip to the coast" asked which town; "What should we not miss?" asked about interests.
    expect(TRIP_SYSTEM_PROMPT).toMatch(/pick a good one yourself/i);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/answer it directly/i);
    // Eval 2026-10-15: new or moved stops were "placed" with a reorderDay listing invented labels (s15), which the validator drops.
    expect(TRIP_SYSTEM_PROMPT).toMatch(/place a new or moved stop with "after"/i);
  });
});

describe('generate retries an unreadable answer once (eval 2026-10-17: ~1 in 33)', () => {
  const okBody = { candidates: [{ content: { parts: [{ text: '{"reply":"Done.","operations":[]}' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
  const badBody = { candidates: [{ content: { parts: [{ text: '{"reply": "Do' }] } }] };
  const reply = (body: object) => ({ ok: true, json: async () => body, text: async () => '' });
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  it('returns the second answer when the first is unreadable', async () => {
    const f = jest.fn().mockResolvedValueOnce(reply(badBody)).mockResolvedValueOnce(reply(okBody));
    global.fetch = f as never;
    const r = await generate({ system: 's', turns: [{ role: 'user', text: 'x' }], schema: {}, apiKey: 'k' });
    expect(r.json.reply).toBe('Done.');
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('gives up after the second unreadable answer', async () => {
    global.fetch = jest.fn().mockResolvedValue(reply(badBody)) as never;
    await expect(generate({ system: 's', turns: [{ role: 'user', text: 'x' }], schema: {}, apiKey: 'k' })).rejects.toThrow('unreadable');
  });
});
