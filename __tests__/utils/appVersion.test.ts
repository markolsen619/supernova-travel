import { appVersionLabel } from '@/utils/appVersion';

describe('appVersionLabel', () => {
  it('shows the version with its build', () => {
    expect(appVersionLabel('1.0.4', '33')).toBe('1.0.4 (33)');
  });
  it('shows what it has', () => {
    expect(appVersionLabel('1.0.4', null)).toBe('1.0.4');
    expect(appVersionLabel(null, null)).toBe('');
  });
});
