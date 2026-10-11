import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { auth, db } from '@/services/firebase';
import { mapDiagnosticDoc, type MapLoadError } from '@/utils/mapLoadHealth';

/**
 * Records one map download failure in `mapDiagnostics` (create-only; read with the
 * Admin SDK). Never throws — a report that fails must not touch the map.
 */
export function reportMapError(e: MapLoadError, ctx: { tripId: string; basemap: string; flying: boolean; msSinceOpen: number }): void {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  addDoc(collection(db, 'mapDiagnostics'), {
    ...mapDiagnosticDoc(e, {
      uid,
      ...ctx,
      appVersion: Application.nativeApplicationVersion ?? null,
      buildNumber: Application.nativeBuildVersion ?? null,
      osVersion: Device.osVersion ?? null,
      deviceModel: Device.modelId ?? null,
    }),
    createdAt: serverTimestamp(),
  }).catch((err) => console.warn('[mapDiagnostics] not recorded', err));
}
