// __tests__/utils/calendarLinks.test.ts
import { feedHttpsUrl, feedWebcalUrl, googleCalendarAddUrl } from '@/utils/calendarLinks';

const T = 'abcdefghijklmnopqrstuvwx';
it('builds the feed, webcal and Google links', () => {
  expect(feedHttpsUrl(T)).toBe(`https://supernova-a2125.web.app/cal/${T}.ics`);
  expect(feedWebcalUrl(T)).toBe(`webcal://supernova-a2125.web.app/cal/${T}.ics`);
  expect(googleCalendarAddUrl(T)).toBe(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://supernova-a2125.web.app/cal/${T}.ics`)}`);
});
