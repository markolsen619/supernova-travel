import { resolveLinkRoute } from '@/utils/linkRoute';

describe('resolveLinkRoute', () => {
  it('a shared trip link, from the web or the app scheme, opens the trip', () => {
    expect(resolveLinkRoute('https://supernova-a2125.web.app/trip/AbC123')).toBe('/trip/AbC123');
    expect(resolveLinkRoute('https://supernova-a2125.web.app/trip/AbC123?utm=x')).toBe('/trip/AbC123');
    expect(resolveLinkRoute('supernova://trip/AbC123')).toBe('/trip/AbC123');
  });
  it('anything else is left to the default launch', () => {
    expect(resolveLinkRoute(null)).toBeNull();
    expect(resolveLinkRoute('supernova://')).toBeNull();
    expect(resolveLinkRoute('https://supernova-a2125.web.app/privacy')).toBeNull();
    expect(resolveLinkRoute('https://evil.example/trip/AbC123')).toBeNull();
    expect(resolveLinkRoute('supernova://trip/../settings')).toBeNull();
    expect(resolveLinkRoute('exp+supernova-travel://expo-development-client/?url=x')).toBeNull();
  });
});
