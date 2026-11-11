/** Download URLs for a save's screenshots (private folder; owner-only rules), resolved once per session. */
import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/services/firebase';

const cache = new Map<string, Promise<string | null>>();
const urlFor = (path: string) => {
  if (!cache.has(path)) cache.set(path, getDownloadURL(ref(storage, path)).catch(() => null));
  return cache.get(path)!;
};

export function useShotUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    let live = true;
    Promise.all(paths.map(async (p) => [p, await urlFor(p)] as const)).then((pairs) => {
      if (!live) return;
      setUrls(Object.fromEntries(pairs.filter((x): x is readonly [string, string] => !!x[1])));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
