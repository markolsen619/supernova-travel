// utils/sessionSnapshot.ts
/**
 * What the app needs to open signed in without signal (offline spec §2): the profile, tier, onboarding and
 * consent state and the moderation lists, saved after each successful hydrateSession. Pure.
 */
export type SessionSnapshot = {
  v: 1;
  uid: string;
  profile: Record<string, unknown>;
  tier: 'free' | 'pro' | 'business';
  hasSeenOnboarding: boolean;
  aiConsentVersion: number | null;
  blockedUids: string[];
  hiddenKeys: string[];
  savedAt: number;
};

export function snapshotKey(uid: string): string {
  return `sessionSnapshot:${uid}`;
}

export function parseSnapshot(raw: string | null, uid: string): SessionSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SessionSnapshot;
    return s && s.v === 1 && s.uid === uid ? s : null;
  } catch {
    return null;
  }
}

export function canUseSnapshot(a: { readFailed: boolean; offline: boolean; snapshot: SessionSnapshot | null; uid: string }): boolean {
  return a.readFailed && a.offline && !!a.snapshot && a.snapshot.uid === a.uid;
}
