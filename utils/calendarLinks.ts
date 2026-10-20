// utils/calendarLinks.ts
/** Links for the private calendar feed (spec 2026-10-19 §1). Pure. */
const HOST = 'supernova-a2125.web.app';
export const feedHttpsUrl = (token: string) => `https://${HOST}/cal/${token}.ics`;
export const feedWebcalUrl = (token: string) => `webcal://${HOST}/cal/${token}.ics`;
export const googleCalendarAddUrl = (token: string) =>
  `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedWebcalUrl(token))}`;
