jest.mock('@/services/firebase', () => ({ db: {}, storage: {}, auth: {} }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-image-picker', () => ({}));

import { MAX_JOURNAL_PHOTOS } from '@/hooks/useJournal';

it('a stop holds 10 photos (past trips from photos, 2026-10-25)', () => {
  expect(MAX_JOURNAL_PHOTOS).toBe(10);
});
