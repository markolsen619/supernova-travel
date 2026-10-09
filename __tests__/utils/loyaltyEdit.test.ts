import { handEditedBalance } from '@/utils/loyaltyEdit';

describe('handEditedBalance', () => {
  it('a typed balance is the newest, so an older statement can no longer replace it', () => {
    expect(handEditedBalance(40000, 45210, '2026-10-10')).toEqual({ balanceAsOf: '2026-10-10', fromEmail: false });
  });
  it('leaves an emailed balance alone when you edit something else', () => {
    expect(handEditedBalance(45210, 45210, '2026-10-10')).toBeNull();
  });
});
