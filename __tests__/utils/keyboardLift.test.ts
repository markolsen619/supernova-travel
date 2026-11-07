import { keyboardLiftBehavior } from '@/utils/keyboardLift';

it('Android (edge-to-edge) shrinks the form by the keyboard so its scroll view brings the field up; iOS keeps automaticallyAdjustKeyboardInsets', () => {
  expect(keyboardLiftBehavior('android')).toBe('padding');
  expect(keyboardLiftBehavior('ios')).toBeUndefined();
  expect(keyboardLiftBehavior('web')).toBeUndefined();
});
