/**
 * components/profile/TripsGrid.tsx
 *
 * Profile-specific wrapper around TripGrid. Exists so future profile-specific
 * trip display logic can live here without touching the shared TripGrid component.
 */

import React from 'react';

import { TripGrid } from '@/components/explore/TripGrid';
import type { AuthorInfo } from '@/hooks/useAuthorProfiles';
import { Trip } from '@/types';

interface TripsGridProps {
  trips: Trip[];
  onTripPress: (id: string) => void;
  /** Single-author map ({ [uid]: info }) — every trip here belongs to the
   * profile being viewed, so callers build this from that one already-loaded
   * profile rather than a batch lookup. */
  authorProfiles?: Record<string, AuthorInfo>;
}

export function TripsGrid({ trips, onTripPress, authorProfiles }: TripsGridProps) {
  return <TripGrid trips={trips} onTripPress={onTripPress} authorProfiles={authorProfiles} />;
}
