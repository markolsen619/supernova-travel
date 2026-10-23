// The local Expo module modules/add-pass-button keeps its Swift code in an ios/ folder. An unanchored `ios/`
// in .gitignore/.easignore matched it at any depth: the native button never reached git or EAS (review, 2026-10-22).
import fs from 'fs';
import path from 'path';

const lines = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8').split('\n').map((l) => l.trim());

describe.each(['.gitignore', '.easignore'])('%s', (file) => {
  it('ignores only the generated top-level native folders, not modules/*/ios', () => {
    const l = lines(file);
    expect(l).not.toContain('ios/');
    expect(l).not.toContain('android/');
    expect(l).toContain('/ios/');
    expect(l).toContain('/android/');
  });
});
