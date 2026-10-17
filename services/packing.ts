import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

/** Packing item writes, shared by the Packing screen and Nova (members only per firestore.rules). */
export async function addPackingItem(tripId: string, a: { label: string; category: string; addedByUid: string }): Promise<string> {
  const ref = await addDoc(collection(db, 'trips', tripId, 'packingItems'), {
    label: a.label, category: a.category, checked: false, isCustom: true, addedByUid: a.addedByUid, createdAt: serverTimestamp(),
  });
  return ref.id;
}
export function setPackingChecked(tripId: string, itemId: string, checked: boolean): Promise<void> {
  return updateDoc(doc(db, 'trips', tripId, 'packingItems', itemId), { checked });
}
export function deletePackingItem(tripId: string, itemId: string): Promise<void> {
  return deleteDoc(doc(db, 'trips', tripId, 'packingItems', itemId));
}
