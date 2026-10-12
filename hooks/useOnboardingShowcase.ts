import { useMemo } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDestinations } from '@/hooks/useDestinations';
import {
  editorialEyebrow,
  itineraryPreview,
  pickCommunityFaces,
  type FaceCandidate,
  type PreviewRow,
} from '@/utils/onboardingShowcase';
import type { ActivityType } from '@/types';

export interface ShowcaseTrip {
  id: string;
  title: string;
  eyebrow: string;
  coverUrl: string;
}

const TEN_MINUTES = 10 * 60 * 1000;
const COMMUNITY_FACES = 6;

/** Supernova's own public trips — never someone's real plans, so no dates or "Upcoming". */
async function fetchEditorialTrips() {
  const snap = await getDocs(query(
    collection(db, 'trips'),
    where('isEditorial', '==', true),
    where('visibility', '==', 'public'),
    limit(12),
  ));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as { id: string; title?: string; coverImageUrl?: string; moderationHidden?: boolean; destination: { name: string; countryCode?: string | null }; destinationKeys?: string[] })
    .filter((t): t is typeof t & { coverImageUrl: string } => typeof t.coverImageUrl === 'string' && !!t.coverImageUrl && !t.moderationHidden);
}

/** Day 1 of one editorial trip, for the AI slide. */
async function fetchDayOne(tripId: string): Promise<PreviewRow[]> {
  const days = await getDocs(query(collection(db, 'trips', tripId, 'days'), where('dayNumber', '==', 1), limit(1)));
  const day = days.docs[0];
  if (!day) return [];
  const acts = await getDocs(query(collection(day.ref, 'activities'), orderBy('order')));
  return itineraryPreview(acts.docs.map((a) => {
    const v = a.data();
    return { type: (v.type ?? 'activity') as ActivityType, title: String(v.title ?? ''), placeName: v.placeName ?? null, order: v.order ?? 0 };
  }));
}

/** Two slices of travelers — the most followed and the newest — so the draw changes as people sign up. */
async function fetchFacePool(): Promise<FaceCandidate[]> {
  const toFace = (d: { id: string; data: () => Record<string, any> }): FaceCandidate => {
    const v = d.data();
    return {
      uid: d.id,
      name: v.fullName ?? v.displayName ?? '',
      avatarUrl: v.avatarUrl ?? null,
      isPrivate: v.settings?.privacy === 'private',
      isEditorial: v.isEditorial === true,
      moderationHidden: v.moderationHidden === true,
    };
  };
  const [top, newest] = await Promise.all([
    getDocs(query(collection(db, 'users'), orderBy('followersCount', 'desc'), limit(30))),
    getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(30))),
  ]);
  return [...top.docs, ...newest.docs].map(toFace);
}

/**
 * Everything the onboarding showcase shows (docs: CLAUDE.md, Onboarding): editorial trips for
 * Discover, one trip's first day for the AI slide, and a fresh random handful of travelers.
 */
export function useOnboardingShowcase() {
  const selfUid = useAuthStore((s) => s.user?.uid ?? null);
  const { destinations } = useDestinations();

  const { data: rawTrips = [] } = useQuery({ queryKey: ['onboarding', 'editorialTrips'], queryFn: fetchEditorialTrips, staleTime: TEN_MINUTES });
  const featured = rawTrips[0] ?? null;
  const { data: dayOne = [] } = useQuery({
    queryKey: ['onboarding', 'dayOne', featured?.id],
    queryFn: () => fetchDayOne(featured!.id),
    enabled: !!featured,
    staleTime: TEN_MINUTES,
  });
  const { data: pool = [] } = useQuery({ queryKey: ['onboarding', 'facePool'], queryFn: fetchFacePool, staleTime: TEN_MINUTES });

  const countryBySlug = useMemo(
    () => Object.fromEntries(destinations.map((d) => [d.slug, d.countryName])),
    [destinations],
  );

  const trips: ShowcaseTrip[] = useMemo(
    () => rawTrips.map((t) => ({ id: t.id, title: String(t.title ?? ''), coverUrl: t.coverImageUrl, eyebrow: editorialEyebrow(t, countryBySlug) })),
    [rawTrips, countryBySlug],
  );

  // Drawn once per pool load: a different handful each time onboarding opens, steady while it's open.
  const faces = useMemo(
    () => pickCommunityFaces(pool, COMMUNITY_FACES, { selfUid, random: Math.random }),
    [pool, selfUid],
  );

  return {
    trips,
    itinerary: featured ? { trip: trips.find((t) => t.id === featured.id) ?? null, rows: dayOne } : null,
    faces,
  };
}
