/**
 * components/profile/TripsGrid.tsx
 *
 * Profile-specific wrapper around TripGrid. Exists so future profile-specific
 * trip display logic can live here without touching the shared TripGrid component.
 */

import React from 'react';

import { TripGrid } from '@/components/explore/TripGrid';
import { Trip } from '@/types';

interface TripsGridProps {
  trips: Trip[];
  onTripPress: (id: string) => void;
}

export function TripsGrid({ trips, onTripPress }: TripsGridProps) {
  return <TripGrid trips={trips} onTripPress={onTripPress} />;
}
