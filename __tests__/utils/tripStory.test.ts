import { storyContent } from '@/utils/tripStory';

const stop = (title: string, type = 'activity', order = 0) => ({ id: title, title, type, order });
it('storyContent: cities and length up top, then the trip\'s highlight stops (not hotels, flights or free time); no dates', () => {
  const c = storyContent({
    title: 'Portugal by train', destination: { name: 'Lisbon' }, additionalDestinations: [{ name: 'Porto' }],
    days: [
      { dayNumber: 2, activities: [stop('Livraria Lello', 'activity', 1), stop('Hotel', 'hotel', 0)] },
      { dayNumber: 1, activities: [stop('Flight TP1', 'flight', 0), stop('Belém Tower', 'activity', 1), stop('Time Out Market', 'restaurant', 2), stop('Free afternoon', 'free', 3)] },
      { dayNumber: 3, activities: [stop('Ribeira', 'activity', 0), stop('Port tasting', 'activity', 1)] },
    ],
  } as never);
  expect(c).toEqual({ eyebrow: 'LISBON · PORTO · 3 DAYS', title: 'Portugal by train', stops: ['Belém Tower', 'Time Out Market', 'Livraria Lello', 'Ribeira'] });
});
