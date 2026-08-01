# Post/Trip Profile Categorization & Post Editing

**Date:** 2026-07-28
**Status:** Approved

## Context

Three related gaps in the posting flow, surfaced from the home/feed posting experience:

1. **Double-publish bug.** Sharing a trip to the feed (`app/post/create-trip.tsx` →
   `useCreatePost().createTripPost`) creates a `posts/{postId}` document with `mediaType: 'trip'`,
   separate from the canonical `trips/{tripId}` document the trip already lives in. Both
   `components/profile/PostsGrid.tsx` (public profile) and the own-profile Posts tab in
   `app/(tabs)/profile.tsx` query every `posts` doc by `authorUid` with no `mediaType` filter, so a
   shared trip renders in **both** the Trips tab (from `trips`) and the Posts tab (from `posts`) — the
   same trip appears twice on a profile.
2. **Post editing is incomplete.** `app/post/[id].tsx` already lets the post's author edit the caption
   and delete the post outright (both enforced by `firestore.rules`, not just the UI). It does not let
   the author change the place name or the photo set after publishing, and there is no way for a
   comment's author to edit or delete their own comment — even though `firestore.rules` already
   permits both (`match /comments/{commentId} { allow update, delete: if ... resource.data.authorUid`).
   The gap is UI only.
3. **Save-to-profile is already correct.** `hooks/useSavePost.ts` only ever writes to
   `users/{uid}/savedTrips` when the user taps the feed's Save button — nothing about posting or
   creating a trip auto-saves it. No change needed here; confirmed during investigation, listed for
   completeness.

**Explicitly out of scope** (per user decision during brainstorming):
- Video post creation. `PostMediaType` already includes `'video'` and `FeedCard`/`VideoPlayer` already
  render video posts, but there is currently no UI path to create one (`create-photo.tsx` only picks
  images). Building that composer is separate follow-up work.
- Post-owner moderation of other users' comments (delete-any-comment). Only the comment's own author
  gets edit/delete.
- Fixing `commentsCount`. It is initialized to `0` at post-creation and never incremented anywhere —
  `functions/src/postEvents.ts`'s `onCommentCreated` only sends notifications, it doesn't touch the
  counter. Pre-existing, unrelated bug; not touched by this work.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Fixing the duplicate-post bug | Client-side filter (`.filter(p => p.mediaType !== 'trip')`) after the existing fetch, in both `PostsGrid.tsx` and `profile.tsx`'s `fetchUserPosts` | A query-level `where('mediaType','in',[...])` needs a new Firestore composite index and a deploy step; filtering the already-fetched capped page (`limit(60)`) is simpler, needs no infra change, and matches the "soft cap on a display grid" pattern already used elsewhere in this codebase |
| Feed itself | Unchanged | Trip-shares are supposed to appear in the feed (that's the point of "Share a trip") — `FeedCard` already renders them with distinct trip UI. Only the profile Posts tab/grid was wrong |
| Post-edit UI location | New dedicated modal route `app/post/edit/[id].tsx`, not an expansion of the existing inline edit block in `post/[id].tsx` | The inline block today is a one-line caption `TextInput`. Bolting a full add/remove/reorder photo grid onto the post-detail scroll view — which also has to share space with the comment thread — would overload a screen with a different primary job. A dedicated screen mirrors `create-photo.tsx`'s existing composer UI (same thumbnail-grid/remove/add-more visual pattern, so it's immediately familiar) and matches this codebase's precedent of separate edit surfaces (`EditProfileSheet`) |
| Editable fields | Caption (all posts) · place name + photo grid add/remove/**reorder** (photo posts only) · delete post (all posts, moved onto this screen) | Trip posts (`mediaType: 'trip'`) derive their place/photo from the linked trip — editing them independently would desync from the trip and confuse "which one is the source of truth." Trip posts stay caption + delete only, same as today |
| Photo reorder mechanism | `react-native-draggable-flatlist`'s `DraggableFlatList` with `horizontal` — a horizontal strip of thumbnails, drag left/right to reorder | Already a project dependency (per CLAUDE.md, "available for drag-to-reorder"), already used this way for trip-activity/destination reordering. The library's type defs (`lib/typescript/types.d.ts`) confirm it has no `numColumns` grid mode — only single-row/column or `horizontal` — so a wrapping 3-per-row grid (like `create-photo.tsx`'s static grid) isn't achievable with drag support from this library. A horizontal strip is the closest supported layout and is a common, recognizable pattern for reordering a small photo set |
| Photo upload logic | Extract the existing `uploadImage()` helper out of `hooks/useCreatePost.ts` into a shared location both `useCreatePost` and the new edit hook call | Avoids duplicating the Storage-upload implementation between create and edit flows |
| New Firestore/Storage logic location | New hook `hooks/useEditPost.ts` exposing `updateCaption`, `updatePlace`, `updatePhotos`, `deletePost` | Matches how `useCreatePost`/`useSavePost` already own this class of Firestore/Storage logic rather than inlining `updateDoc`/`deleteDoc` calls directly in a screen component (the one inconsistency today — inline calls in `post/[id].tsx` — is being resolved by this same change, not preserved) |
| Comment edit/delete location | Inline in the existing `CommentRow` / `post/[id].tsx`, no new hook | Two Firestore calls (`updateDoc`/`deleteDoc` on a single comment doc) — proportionate to keep inline, consistent with how comment *creation* (`handleSubmitComment`) is already inline in the same file |
| Comment edit/delete scope | Comment author only (`comment.authorUid === currentUid`) | Matches existing `firestore.rules`; post-owner moderation of others' comments was explicitly declined |
| Comment list refresh | None needed | The comment thread already renders from a live `onSnapshot` listener — edits/deletes reflect immediately for every viewer without a manual invalidate/refetch |
| Firestore rules changes | **None** | `posts` update rule already allows the author to change any field (covers place/photos); `comments` update/delete rule already scopes to the comment's own `authorUid`. Both edits are pure UI work |

## Part 1: Fix Double-Publish

### `components/profile/PostsGrid.tsx`

`fetchUserPosts()` return value gets filtered before the component renders it:

```ts
const posts = allPosts.filter((p) => p.mediaType !== 'trip');
```

Applied where `data: posts = []` is currently destructured from `useQuery` — either inside the
`queryFn` itself or immediately after. `PostDoc` needs `mediaType?: string` added to its interface
(currently only has `id`/`mediaUrl`).

### `app/(tabs)/profile.tsx`

Same filter, same treatment, in its own (separately defined but identically-shaped) `fetchUserPosts()`
— its `PostDoc` interface already includes `mediaType?: string`, so only the filter line is new.

### Not touched

- `hooks/useTripList.ts` / the Trips tab — already queries `trips` directly, already correct.
- `hooks/useFeed.ts` / `components/feed/FeedCard.tsx` — trip-shares are meant to show in the feed,
  unchanged.
- `useCreatePost.createTripPost` — still writes a `posts` doc with `mediaType: 'trip'` linking back to
  the trip via `tripId`; that document is the feed-facing "share," not a duplicate-of-record. Only the
  Posts *grid* was wrong to include it.

## Part 2: Post Editing

### Shared upload helper

`uploadImage(uid: string, uri: string, index: number): Promise<string>` moves out of
`hooks/useCreatePost.ts` into a shared module (`services/postMedia.ts` or similar — exact placement is
an implementation detail) so both `useCreatePost` and the new `useEditPost` call the same
implementation. `useCreatePost.createPhotoPost` is updated to import it from the new location; no
behavior change there.

### `hooks/useEditPost.ts` (new)

Takes the post being edited, exposes:

- `updateCaption(caption: string): Promise<void>` — `updateDoc(doc(db,'posts',id), { caption: caption.trim() })`
- `updatePlace(placeName: string | null): Promise<void>` — same pattern, `placeName` field
- `updatePhotos(items: PhotoItem[]): Promise<void>` where `PhotoItem` is a tagged union of
  `{ kind: 'existing', url: string }` (already-uploaded, keeps its URL) and
  `{ kind: 'new', localUri: string }` (needs uploading first). Uploads every `new` item via the shared
  `uploadImage` helper, assembles the final `mediaUrls` array in the given (post-reorder) order, and
  writes `{ mediaUrls, mediaUrl: mediaUrls[0], thumbnailUrl: mediaUrls[0] }` in one `updateDoc`
  — mirrors exactly how `createPhotoPost` derives `mediaUrl`/`thumbnailUrl` from `mediaUrls[0]` today,
  so the invariant "first photo is the cover" holds for both creation and editing.
- `deletePost(): Promise<void>` — `deleteDoc(doc(db,'posts',id))`, same as today's inline
  `handleDeletePost` in `post/[id].tsx`, just relocated.
- `isSaving`, `uploadProgress` state, and on success: invalidate `['userPosts']` and `['feed']`
  (matching the invalidation `useCreatePost` already performs), plus `['post', id]` if that query key
  exists for the detail screen.

No Storage cleanup of removed/replaced photo URLs — matches today's existing behavior where deleting a
post entirely also doesn't clean up its Storage objects. Not a new gap introduced by this change.

### `app/post/edit/[id].tsx` (new)

Registered in `app/_layout.tsx` as `<Stack.Screen name="post/edit/[id]" options={{ presentation: 'modal' }} />`,
alongside the existing `post/create-photo` and `post/create-trip` entries.

- Loads the post by `id` (same one-time `getDoc` pattern `post/[id].tsx` uses); if
  `post.authorUid !== currentUid`, `router.back()` immediately (defense in depth — the pencil icon
  that links here is owner-only already, and `firestore.rules` blocks the write server-side regardless).
- Header: Cancel (left) / "Edit post" (title) / Save (right, disabled until dirty) — same header shape
  as `create-photo.tsx`.
- Caption field: `TextInput`, prefilled, always shown.
- For `mediaType === 'photo'` only:
  - Place field: `TextInput` with a `MapPin` icon, prefilled from `post.placeName`, same visual
    treatment as `create-photo.tsx`'s place row.
  - Photo strip: a horizontal `DraggableFlatList` (`horizontal` prop) of thumbnails, seeded from
    `post.mediaUrls` as `{ kind: 'existing', url }` items; long-press + drag left/right to reorder
    (same long-press-then-`drag()` interaction `DestinationListEditor.tsx` already uses); per-thumbnail
    remove (×) button, same visual treatment as `create-photo.tsx`'s grid; a trailing "Add more" tile
    (rendered as the list's `ListFooterComponent`, not a draggable item) opens `expo-image-picker`,
    appending picks as `{ kind: 'new', localUri }` items, capped at `MAX_PHOTOS = 10` (same constant
    already in `create-photo.tsx`) counting existing + new together. The first item in the list is
    always the post's cover photo — a small "Cover" badge on that thumbnail makes this legible, since
    reordering now has a visible consequence (unlike `DestinationListEditor`, where order only affects
    display order, not which item is "primary").
- For `mediaType === 'trip'`: place/photo sections hidden entirely; only caption is editable, matching
  today's behavior on this post type.
- Save button calls `updateCaption`/`updatePlace`/`updatePhotos` (only the ones that actually changed)
  then `router.back()`.
- Delete-post: danger-styled button at the bottom of the screen (same placement/style the inline block
  in `post/[id].tsx` uses today), confirms via the same `Alert.alert('Delete this post?', ...)` pattern,
  calls `deletePost()`, then `router.dismissTo('/')` or equivalent to leave both the edit screen and the
  now-deleted post's detail screen.

### `app/post/[id].tsx` changes

- The inline `editing`/`captionDraft`/`savingCaption`/`editError` state and the entire `editBlock` JSX
  are removed.
- The header's pencil icon (`isOwner` branch) changes from `onPress={startEditing}` to
  `onPress={() => router.push(`/post/edit/${post.id}`)}`.
- `handleSaveCaption`/`handleDeletePost` functions are removed from this file (logic now lives in
  `useEditPost`, invoked from the new edit screen).

## Part 3: Comment Edit/Delete (Own Comments Only)

All changes contained to `app/post/[id].tsx`'s `CommentRow` and its parent:

- `CommentRow` gains a `currentUid: string` prop (already available in the parent via
  `useAuthStore`) and internal `isEditing` state.
- When `comment.authorUid === currentUid`, a small pencil + trash affordance appears on the row
  (low-emphasis utility icons, per the design system's "bold/regular weight for small utility icons"
  rule — not the duotone semantic-icon treatment).
- Pencil tap: row swaps its `Text` for a `TextInput` prefilled with `comment.text`, with inline
  Save/Cancel — same interaction shape the post caption editor already used before this change (now
  reused for comments instead). Save calls
  `updateDoc(doc(db,'posts',postId,'comments',comment.id), { text: draft.trim() })`.
- Trash tap: `Alert.alert('Delete this comment?', ...)` → confirm → `deleteDoc(doc(db,'posts',postId,'comments',comment.id))`.
- No `commentsCount` adjustment on delete (see Context — the counter isn't maintained by anything
  today; not introduced or fixed by this change).
- No manual query invalidation needed — the comments list is driven by the existing `onSnapshot`
  listener in `post/[id].tsx`, so edits/deletes appear immediately without a refetch.

## Design System Compliance

Both new UI surfaces (`app/post/edit/[id].tsx`, the comment row's edit/delete affordances) will run
through the `supernova-design` skill's pre-ship checklist before being considered done — Phosphor icons
only, no dashed borders outside the one sanctioned dropzone pattern already established in
`create-photo.tsx`, ≥44pt touch targets, haptics on create/delete actions, and light-editorial palette
throughout (no new always-dark surfaces are introduced by this work).

## Out of Scope

- Video post creation (composer UI to pick/upload video, `mediaType: 'video'` creation path).
- Post-owner moderation of other users' comments.
- Fixing `commentsCount` maintenance (pre-existing, unrelated bug).
- Storage cleanup of orphaned photo objects (on post delete or on photo removal during edit) — matches
  existing behavior, not a regression introduced here.
- Editing a trip post's linked trip (swapping which trip it points to) — trip posts remain
  caption-only-editable.
