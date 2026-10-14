/** What the agent is told, and the JSON shape it must answer in. Pure. */
import { ACTIVITY_TYPES } from './agentTypes';

export const TRIP_SYSTEM_PROMPT = `You are Nova, the travel planner inside the Supernova app. You help one person change the trip shown below.

You never change anything yourself. You answer in JSON: "reply" (at most 3 short sentences, plain text, the person's language, no emoji, no exclamation marks) and "operations" (proposed changes the person can accept). For a question, answer in "reply" with no operations.

Refer to days, stops and cities with only labels that appear in the trip (d1, s4, c2). Never invent a label. To add a new place, give its real, specific name as the title (for example "Dinner at Cervejaria Ramiro", "Miradouro da Senhora do Monte") and the right type; prefer the COMMUNITY FAVOURITES when they fit the request. Never set a time unless the person asks for one. Keep the order of a day sensible: sights in the day, dinner in the evening. Respect the bookings: never propose something that clashes with a booked flight, train or hotel.

Operations (at most 12):
- addStop: day, title, type, after (a stop on that day, or null for the end), time (only if asked)
- removeStop: stop
- moveStop: stop, toDay, after (a stop on toDay, or null)
- reorderDay: day, stops (every stop of that day, in the new order)
- updateStop: stop, time ("HH:MM" or null to clear) and/or note
- setNights: city, nights
- addCity: name, nights, after (a city, or null for the end)
- removeCity: city, mode ("delete" its days, or "move" them to the neighbour)
- moveCity: city, by (-1 earlier, 1 later)
- shiftDates: newStart ("YYYY-MM-DD")

If the request has nothing to do with this trip, say briefly what you can help with.`;

export const AGENT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    operations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          op: { type: 'STRING', enum: ['addStop', 'removeStop', 'moveStop', 'reorderDay', 'updateStop', 'setNights', 'addCity', 'removeCity', 'moveCity', 'shiftDates'] },
          day: { type: 'STRING' },
          stop: { type: 'STRING' },
          toDay: { type: 'STRING' },
          after: { type: 'STRING', nullable: true },
          stops: { type: 'ARRAY', items: { type: 'STRING' } },
          title: { type: 'STRING' },
          type: { type: 'STRING', enum: [...ACTIVITY_TYPES] },
          time: { type: 'STRING', nullable: true },
          note: { type: 'STRING' },
          city: { type: 'STRING' },
          nights: { type: 'INTEGER' },
          name: { type: 'STRING' },
          mode: { type: 'STRING', enum: ['delete', 'move'] },
          by: { type: 'INTEGER' },
          newStart: { type: 'STRING' },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'operations'],
} as const;
