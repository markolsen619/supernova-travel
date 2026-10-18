/** The rows of "People on this trip": the organizer first, then everyone going. Pure. */
export interface MemberRow { uid: string; name: string; avatarUrl: string | null; role: 'Organizer' | 'Going' }

export function memberRows(
  authorUid: string, collaborators: string[], profiles: Record<string, { name?: string; avatarUrl?: string | null } | undefined>,
): MemberRow[] {
  const row = (uid: string, role: MemberRow['role']): MemberRow =>
    ({ uid, name: profiles[uid]?.name || 'Traveler', avatarUrl: profiles[uid]?.avatarUrl ?? null, role });
  return [row(authorUid, 'Organizer'), ...collaborators.filter((u) => u !== authorUid).map((u) => row(u, 'Going'))];
}
