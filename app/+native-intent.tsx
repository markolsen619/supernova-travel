/** Expo Router's hook for links from the system: the share extension's own link goes to the tabs (utils/shareIntent). */
import { shareRedirect } from '@/utils/shareIntent';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return shareRedirect(path);
  } catch {
    return path;
  }
}
