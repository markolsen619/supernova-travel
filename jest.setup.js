// Mock Firebase services before any tests run
jest.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));
