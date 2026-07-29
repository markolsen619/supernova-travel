# Post Categorization & Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop trip-shares from double-appearing on profiles (Posts tab + Trips tab), and let a post's
author fully edit it (caption, place, photos — add/remove/reorder) and let a comment's author edit or
delete their own comment.

**Architecture:** Two independent bug/feature tracks against the existing `posts` Firestore collection.
Track A (Tasks 1–2) is a pure client-side query filter — no schema or rules change. Track B (Tasks
3–6) adds a new `useEditPost` hook and a dedicated modal edit screen (`app/post/edit/[id].tsx`),
following the same hook-owns-Firestore-logic pattern `useCreatePost`/`useSavePost` already use. Track C
(Task 7) adds comment self-edit/delete inline in the existing post detail screen. No Firestore rules
changes anywhere — `posts` update and `comments` update/delete are already scoped correctly.

**Tech Stack:** Expo Router v6, Firebase (Firestore + Storage) client SDK, TanStack React Query,
`react-native-draggable-flatlist` (already a dependency), `expo-image-picker`, Jest (`jest-expo` preset,
no React Native Testing Library — see Testing Notes below).

**Spec:** `docs/superpowers/specs/2026-07-28-post-categorization-and-editing-design.md`

## Global Constraints

- No emoji anywhere — Phosphor icons only (`phosphor-react-native`), duotone for semantic icons,
  bold/regular for small utility icons (edit/delete affordances on comments).
- No dashed borders on new UI except where already established as a dropzone (not applicable to this
  work — no new empty-picker states are introduced).
- Touch targets ≥44pt; icon-only buttons need `accessibilityLabel`.
- Haptics: `Light` on navigation/selection (Cancel, drag-start), `Medium` on save/create/destructive
  actions (Save, Delete).
- Every themed color comes from `const { colors } = useTheme()` — never import `DarkColors`/
  `LightColors` directly.
- `StyleSheet.create` stays module-level and static; any theme-dependent color is an inline style.
- All imports use the `@/` path alias.
- No Firestore rules changes in this plan — verified during design that `posts` (author can update any
  field) and `comments` (author can update/delete their own) already permit every write this plan makes.
- **Testing Notes:** this repo has no React Native Testing Library — there is no way to render-test a
  screen or component. Existing test coverage (`__tests__/hooks/useOnboardingContent.test.ts`,
  `__tests__/utils/date.test.ts`) only unit-tests **pure functions extracted alongside** a hook/screen,
  with `jest.mock('@/services/firebase', () => ({ auth: {}, db: {}, storage: {}, functions: {} }))` at
  the top when the file under test transitively imports `@/services/firebase`. This plan follows the
  same convention: pure logic gets a Jest unit test; Firestore/Storage-calling code and UI screens get a
  manual verification step against the running app (`npx expo start --ios` / the `run`/`verify` skills)
  instead.
- Before considering the two new/changed UI surfaces (edit screen, comment row) done, run the
  `supernova-design` skill's pre-ship checklist against them.

---

### Task 1: `excludeTripShares` filter utility (TDD)

**Files:**
- Create: `utils/posts.ts`
- Test: `__tests__/utils/posts.test.ts`

**Interfaces:**
- Produces: `excludeTripShares<T extends { mediaType?: string }>(posts: T[]): T[]` — used by Task 2.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/utils/posts.test.ts
import { excludeTripShares } from '@/utils/posts';

describe('excludeTripShares', () => {
  it('filters out posts with mediaType "trip"', () => {
    const posts = [
      { id: '1', mediaType: 'photo' },
      { id: '2', mediaType: 'trip' },
      { id: '3', mediaType: 'video' },
    ];
    expect(excludeTripShares(posts).map((p) => p.id)).toEqual(['1', '3']);
  });

  it('keeps posts with no mediaType set (defensive — legacy data)', () => {
    const posts = [{ id: '1' }];
    expect(excludeTripShares(posts)).toEqual(posts);
  });

  it('returns an empty array unchanged', () => {
    expect(excludeTripShares([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/posts.test.ts`
Expected: FAIL — `Cannot find module '@/utils/posts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// utils/posts.ts
/** Excludes trip-share posts (mediaType: 'trip') from a post list. Trip
 * shares already appear in the profile's Trips tab (sourced from the
 * `trips` collection directly), so showing them again in a Posts grid
 * would double up the same trip. See
 * docs/superpowers/specs/2026-07-28-post-categorization-and-editing-design.md. */
export function excludeTripShares<T extends { mediaType?: string }>(posts: T[]): T[] {
  return posts.filter((p) => p.mediaType !== 'trip');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/posts.test.ts`
Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add utils/posts.ts __tests__/utils/posts.test.ts
git commit -m "feat: add excludeTripShares post-filter utility"
```

---

### Task 2: Apply the filter to both Posts grids (fixes the double-publish bug)

**Files:**
- Modify: `components/profile/PostsGrid.tsx`
- Modify: `app/(tabs)/profile.tsx`

**Interfaces:**
- Consumes: `excludeTripShares` from Task 1 (`@/utils/posts`).

- [ ] **Step 1: Update `PostsGrid.tsx`'s fetch to add `mediaType` and filter it**

In `components/profile/PostsGrid.tsx`, add the import and update `PostDoc`/`fetchUserPosts`:

```ts
import { excludeTripShares } from '@/utils/posts';
```

```ts
interface PostDoc {
  id: string;
  mediaUrl?: string;
  mediaType?: string;
}

async function fetchUserPosts(uid: string): Promise<PostDoc[]> {
  const q = query(
    collection(db, 'posts'),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(60),
  );
  const snap = await getDocs(q);
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PostDoc));
  return excludeTripShares(posts);
}
```

(Only `PostDoc` gaining `mediaType?: string` and the final `return` line are new — the query itself is
unchanged.)

- [ ] **Step 2: Update `app/(tabs)/profile.tsx`'s own `fetchUserPosts` the same way**

Its `PostDoc` interface already has `mediaType?: string` (see the file's existing lines 62–67), so only
the import and the return line change:

```ts
import { excludeTripShares } from '@/utils/posts';
```

```ts
async function fetchUserPosts(uid: string): Promise<PostDoc[]> {
  const q = query(
    collection(db, 'posts'),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(60),
  );
  const snap = await getDocs(q);
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PostDoc));
  return excludeTripShares(posts);
}
```

- [ ] **Step 3: Manually verify the fix**

Run: `npx expo start --ios` (or reuse an already-running Metro instance).

1. In the simulator, open Create → Manual trip (or use an existing trip) so you have at least one trip.
2. From the feed, tap the "+" → Add to feed → Share a trip, pick that trip, share it.
3. Go to your own Profile. Confirm the trip appears once, under the **Trips** tab.
4. Switch to the **Posts** tab — confirm the shared trip does **not** appear there.
5. Post a plain photo (Add to feed → Post a photo). Confirm it **does** appear under Posts.
6. Open another user's public profile that has shared a trip before (or repeat steps 1–4 as a second
   test account) and confirm the same behavior on `PostsGrid.tsx`'s public-profile path.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

Run: `npm test -- --watchAll=false`
Expected: all existing tests still pass, plus the 3 new tests from Task 1.

- [ ] **Step 5: Commit**

```bash
git add components/profile/PostsGrid.tsx "app/(tabs)/profile.tsx"
git commit -m "fix: exclude trip-share posts from the profile Posts grid"
```

---

### Task 3: Extract `uploadPostImage` into a shared module

**Files:**
- Create: `services/postMedia.ts`
- Modify: `hooks/useCreatePost.ts`

**Interfaces:**
- Produces: `uploadPostImage(uid: string, uri: string, index: number): Promise<string>` — used by
  `useCreatePost` (this task) and `useEditPost` (Task 4).

- [ ] **Step 1: Create the shared upload helper**

```ts
// services/postMedia.ts
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/services/firebase';

/** Uploads one local image URI to `posts/{uid}/{timestamp}_{index}.jpg` in
 * Storage and resolves its download URL. Shared by post creation
 * (useCreatePost) and post editing (useEditPost) so both write to the same
 * path convention and error format. */
export async function uploadPostImage(uid: string, uri: string, index: number): Promise<string> {
  const blob = await fetch(uri).then((r) => r.blob());
  const storageRef = ref(storage, `posts/${uid}/${Date.now()}_${index}.jpg`);
  const task = uploadBytesResumable(storageRef, blob);
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      undefined,
      (err) => reject(new Error(`Storage upload failed: ${err.message}`)),
      resolve,
    );
  });
  return getDownloadURL(storageRef);
}
```

- [ ] **Step 2: Update `useCreatePost.ts` to use it**

In `hooks/useCreatePost.ts`, remove the local `uploadImage` function definition (lines 29–42 in the
current file) and its now-unused `ref, uploadBytesResumable, getDownloadURL` import from
`'firebase/storage'`, replacing them with:

```ts
import { uploadPostImage } from '@/services/postMedia';
```

Then in `createPhotoPost`, change the call site:

```ts
for (let i = 0; i < total; i++) {
  const url = await uploadPostImage(user.uid, input.localUris[i], i);
  mediaUrls.push(url);
  setUploadProgress(Math.round(((i + 1) / total) * 100));
}
```

(Only the function name changes — `uploadImage(...)` → `uploadPostImage(...)` — everything else in
`createPhotoPost` and `createTripPost` is untouched.)

- [ ] **Step 3: Manually verify no regression in post creation**

Run: `npx expo start --ios`.

1. From the feed, Add to feed → Post a photo. Pick 2–3 photos, add a caption, tap Post.
2. Confirm the post appears in the feed and in your Posts tab with the correct cover image.

- [ ] **Step 4: Run the test suite**

Run: `npm test -- --watchAll=false`
Expected: all tests still pass (this task has no new tests of its own — `uploadPostImage` is
Storage-dependent side-effecting code, matching this codebase's existing convention of not
unit-testing Firebase Storage/Firestore calls directly).

- [ ] **Step 5: Commit**

```bash
git add services/postMedia.ts hooks/useCreatePost.ts
git commit -m "refactor: extract uploadPostImage into services/postMedia for reuse"
```

---

### Task 4: `useEditPost` hook — caption, place, photos, delete (TDD for the pure part)

**Files:**
- Create: `hooks/useEditPost.ts`
- Test: `__tests__/hooks/useEditPost.test.ts`

**Interfaces:**
- Consumes: `uploadPostImage` from `@/services/postMedia` (Task 3).
- Produces:
  - `type PhotoItem = { kind: 'existing'; url: string } | { kind: 'new'; localUri: string }`
  - `resolveMediaUrls(items: PhotoItem[], uploadedByLocalUri: Record<string, string>): string[]`
  - `useEditPost(postId: string): { updateCaption, updatePlace, updatePhotos, deletePost, isSaving, uploadProgress }`
  - All four exposed by `useEditPost` are async functions: `updateCaption(caption: string): Promise<void>`,
    `updatePlace(placeName: string | null): Promise<void>`, `updatePhotos(items: PhotoItem[]): Promise<void>`,
    `deletePost(): Promise<void>`.
  - Used by `app/post/edit/[id].tsx` (Tasks 5–6).

- [ ] **Step 1: Write the failing test for the pure `resolveMediaUrls` function**

```ts
// __tests__/hooks/useEditPost.test.ts
jest.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

import { resolveMediaUrls, PhotoItem } from '@/hooks/useEditPost';

describe('resolveMediaUrls', () => {
  it('keeps existing URLs and substitutes uploaded URLs for new items, in order', () => {
    const items: PhotoItem[] = [
      { kind: 'existing', url: 'https://cdn/a.jpg' },
      { kind: 'new', localUri: 'file://local/b.jpg' },
      { kind: 'existing', url: 'https://cdn/c.jpg' },
    ];
    const uploaded = { 'file://local/b.jpg': 'https://cdn/b.jpg' };
    expect(resolveMediaUrls(items, uploaded)).toEqual([
      'https://cdn/a.jpg',
      'https://cdn/b.jpg',
      'https://cdn/c.jpg',
    ]);
  });

  it('returns an empty array when given no items', () => {
    expect(resolveMediaUrls([], {})).toEqual([]);
  });

  it('preserves reordering — output order matches input item order, not upload order', () => {
    const items: PhotoItem[] = [
      { kind: 'new', localUri: 'file://local/second.jpg' },
      { kind: 'existing', url: 'https://cdn/first.jpg' },
    ];
    const uploaded = { 'file://local/second.jpg': 'https://cdn/second.jpg' };
    expect(resolveMediaUrls(items, uploaded)).toEqual([
      'https://cdn/second.jpg',
      'https://cdn/first.jpg',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/hooks/useEditPost.test.ts`
Expected: FAIL — `Cannot find module '@/hooks/useEditPost'`

- [ ] **Step 3: Write the full hook implementation (pure function + hook)**

```ts
// hooks/useEditPost.ts
import { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { uploadPostImage } from '@/services/postMedia';

export type PhotoItem = { kind: 'existing'; url: string } | { kind: 'new'; localUri: string };

/** Assembles the final `mediaUrls` array in item order: existing items keep
 * their URL, new items are looked up by their local URI in the just-uploaded
 * map. Order is driven entirely by `items` (post-drag-reorder), not by
 * upload completion order. */
export function resolveMediaUrls(items: PhotoItem[], uploadedByLocalUri: Record<string, string>): string[] {
  return items.map((item) => (item.kind === 'existing' ? item.url : uploadedByLocalUri[item.localUri]));
}

export function useEditPost(postId: string) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['userPosts'] });
    queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['post', postId] });
  }

  async function updateCaption(caption: string): Promise<void> {
    await updateDoc(doc(db, 'posts', postId), { caption: caption.trim() });
    invalidate();
  }

  async function updatePlace(placeName: string | null): Promise<void> {
    await updateDoc(doc(db, 'posts', postId), { placeName: placeName?.trim() || null });
    invalidate();
  }

  async function updatePhotos(items: PhotoItem[]): Promise<void> {
    if (!uid) throw new Error('Not authenticated');
    setIsSaving(true);
    setUploadProgress(0);
    try {
      const newItems = items.filter((i): i is Extract<PhotoItem, { kind: 'new' }> => i.kind === 'new');
      const uploadedByLocalUri: Record<string, string> = {};
      for (let i = 0; i < newItems.length; i++) {
        uploadedByLocalUri[newItems[i].localUri] = await uploadPostImage(uid, newItems[i].localUri, i);
        setUploadProgress(Math.round(((i + 1) / Math.max(newItems.length, 1)) * 100));
      }
      const mediaUrls = resolveMediaUrls(items, uploadedByLocalUri);
      await updateDoc(doc(db, 'posts', postId), {
        mediaUrls,
        mediaUrl: mediaUrls[0] ?? '',
        thumbnailUrl: mediaUrls[0] ?? null,
      });
      invalidate();
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  }

  async function deletePost(): Promise<void> {
    await deleteDoc(doc(db, 'posts', postId));
    invalidate();
  }

  return { updateCaption, updatePlace, updatePhotos, deletePost, isSaving, uploadProgress };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/hooks/useEditPost.test.ts`
Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add hooks/useEditPost.ts __tests__/hooks/useEditPost.test.ts
git commit -m "feat: add useEditPost hook for post caption/place/photo/delete edits"
```

---

### Task 5: New edit screen — caption, place, delete (no photo reordering yet)

**Files:**
- Create: `app/post/edit/[id].tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/post/[id].tsx`

**Interfaces:**
- Consumes: `usePost` (`@/hooks/usePost`, pre-existing), `useEditPost` from Task 4.

- [ ] **Step 1: Register the new modal route**

In `app/_layout.tsx`, add a new `Stack.Screen` line immediately after the existing
`<Stack.Screen name="post/create-trip" options={{ presentation: 'modal' }} />` (currently line 79):

```tsx
<Stack.Screen name="post/edit/[id]" options={{ presentation: 'modal' }} />
```

- [ ] **Step 2: Create the edit screen**

```tsx
// app/post/edit/[id].tsx
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { usePost } from '@/hooks/usePost';
import { useEditPost } from '@/hooks/useEditPost';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/Button';
import { SkeletonBlock, SkeletonListRow } from '@/components/ui/Skeleton';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');

  const { data: post, isLoading } = usePost(id ?? null);
  const isOwner = !!post && !!uid && post.authorUid === uid;
  const { updateCaption, updatePlace, deletePost, isSaving } = useEditPost(id ?? '');

  useEffect(() => {
    if (!isLoading && post && !isOwner) {
      router.back();
    }
  }, [isLoading, post, isOwner, router]);

  const [caption, setCaption] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (post && !initialized) {
      setCaption(post.caption ?? '');
      setPlaceName(post.placeName ?? '');
      setInitialized(true);
    }
  }, [post, initialized]);

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const handleSave = useCallback(async () => {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (caption !== (post.caption ?? '')) {
        await updateCaption(caption);
      }
      if (post.mediaType === 'photo' && placeName !== (post.placeName ?? '')) {
        await updatePlace(placeName.trim() || null);
      }
      router.back();
    } catch (e: unknown) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Check your connection and try again.');
    }
  }, [post, caption, placeName, updateCaption, updatePlace, router]);

  const handleDelete = useCallback(() => {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete this post?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost();
            router.navigate('/(tabs)/profile');
          } catch (e: unknown) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : 'Check your connection and try again.');
          }
        },
      },
    ]);
  }, [post, deletePost, router]);

  if (isLoading || !post) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background.primary, paddingTop: insets.top + Spacing['12'] }]}>
        <SkeletonBlock width="100%" height={100} radius={BorderRadius.lg} />
        <SkeletonListRow />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'], borderBottomColor: colors.background.cardBorder }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleCancel} activeOpacity={0.7}>
          <Text style={[styles.headerBack, { color: colors.text.secondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Edit post</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleSave} disabled={isSaving} activeOpacity={0.7}>
          <Text style={[styles.headerSave, { color: colors.brand.purple }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          style={[styles.captionInput, { color: colors.text.primary, borderBottomColor: colors.background.cardBorder }]}
          placeholder="Write a caption…"
          placeholderTextColor={colors.text.tertiary}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={500}
        />

        {post.mediaType === 'photo' && (
          <View style={[styles.placeRow, { borderBottomColor: colors.background.cardBorder }]}>
            <MapPin size={18} color={colors.text.secondary} weight="duotone" />
            <TextInput
              style={[styles.placeInput, { color: colors.text.primary }]}
              placeholder="Add a place…"
              placeholderTextColor={colors.text.tertiary}
              value={placeName}
              onChangeText={setPlaceName}
              returnKeyType="done"
            />
          </View>
        )}

        <Button
          label="Delete post"
          variant="danger"
          size="md"
          fullWidth
          onPress={handleDelete}
          haptic="none"
          style={styles.deleteButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, paddingHorizontal: Spacing['5'], gap: Spacing['4'] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { minWidth: 60, minHeight: 44, justifyContent: 'center', paddingVertical: Spacing['2'] },
  headerBack: { fontSize: FontSize.base },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  headerSave: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold, textAlign: 'right' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Spacing['10'] },
  captionInput: {
    fontSize: FontSize.base,
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['3'],
    minHeight: 80,
    textAlignVertical: 'top',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
    gap: Spacing['2'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeInput: { flex: 1, fontSize: FontSize.base },
  deleteButton: { marginHorizontal: Spacing['5'], marginTop: Spacing['6'] },
});
```

- [ ] **Step 3: Wire `post/[id].tsx`'s pencil icon to the new screen and remove the old inline edit block**

In `app/post/[id].tsx`:

1. Remove this state (currently near the top of the component):
   ```ts
   const [editing, setEditing] = useState(false);
   const [captionDraft, setCaptionDraft] = useState('');
   const [savingCaption, setSavingCaption] = useState(false);
   const [editError, setEditError] = useState<string | null>(null);
   ```
2. Remove the `startEditing`, `handleSaveCaption`, and `handleDeletePost` functions entirely.
3. Change the pencil icon's `TouchableOpacity` (in the header) from:
   ```tsx
   <TouchableOpacity onPress={startEditing} style={styles.backBtn} hitSlop={8} accessibilityLabel="Edit post">
   ```
   to:
   ```tsx
   <TouchableOpacity
     onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/post/edit/${post.id}`); }}
     style={styles.backBtn}
     hitSlop={8}
     accessibilityLabel="Edit post"
   >
   ```
4. Replace the entire `{editing ? (...) : (!!post.caption && (...))}` conditional block with just the
   non-editing branch (editing no longer happens on this screen):
   ```tsx
   {!!post.caption && (
     <Text style={[styles.caption, { color: colors.text.secondary }]}>{post.caption}</Text>
   )}
   ```
5. Remove the now-unused `editBlock`, `captionInput` (the edit one — note `commentEditInput`, added in
   Task 7, is a different style, don't remove that one when you get there), `editError`, `editActions`,
   `editActionBtn` entries from the `StyleSheet.create` block, and remove the `Button` import if nothing
   else in this file still uses it (check before removing — it doesn't, after this change).

- [ ] **Step 4: Manually verify**

Run: `npx expo start --ios`.

1. Open one of your own photo posts. Tap the pencil icon — confirm it opens the new "Edit post" modal.
2. Change the caption and the place, tap Save. Confirm you're back on the post detail screen and both
   changes are visible.
3. Reopen the edit screen, tap "Delete post", confirm the alert, confirm it deletes and returns you to
   your Profile.
4. Open one of your own trip-share posts (mediaType: 'trip'). Tap the pencil icon — confirm the edit
   screen shows only the caption field (no place field) and the delete button.
5. Open a post that **isn't** yours (someone else's, or use a second test account) and confirm there is
   no pencil icon at all — the edit screen is unreachable through normal navigation for non-owners.

- [ ] **Step 5: Commit**

```bash
git add app/post/edit/[id].tsx app/_layout.tsx app/post/[id].tsx
git commit -m "feat: add dedicated post edit screen for caption, place, and delete"
```

---

### Task 6: Photo strip — add, remove, and drag-to-reorder photos on the edit screen

**Files:**
- Modify: `app/post/edit/[id].tsx`

**Interfaces:**
- Consumes: `PhotoItem`, `resolveMediaUrls` types/behavior from Task 4 (via `updatePhotos`).

- [ ] **Step 1: Add the new imports**

At the top of `app/post/edit/[id].tsx`, add:

```ts
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { Images, X } from 'phosphor-react-native';
import { PhotoItem } from '@/hooks/useEditPost';
```

(`View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView,
Platform` stay in the existing `react-native` import line — only `Image` is newly added to it.)

Also destructure `updatePhotos` and `uploadProgress` from the existing `useEditPost` call:

```ts
const { updateCaption, updatePlace, updatePhotos, deletePost, isSaving, uploadProgress } = useEditPost(id ?? '');
```

- [ ] **Step 2: Add photo state, seeded from the loaded post**

```ts
const MAX_PHOTOS = 10;
```

(module-level, above the component, matching `create-photo.tsx`'s constant)

Inside the component, add:

```ts
const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
```

Extend the existing "seed from post" `useEffect` (the one setting `caption`/`placeName` from `post`) to
also seed photos:

```ts
useEffect(() => {
  if (post && !initialized) {
    setCaption(post.caption ?? '');
    setPlaceName(post.placeName ?? '');
    setPhotoItems((post.mediaUrls ?? []).map((url) => ({ kind: 'existing' as const, url })));
    setInitialized(true);
  }
}, [post, initialized]);
```

- [ ] **Step 3: Add pick/remove/reorder handlers**

```ts
const pickMorePhotos = useCallback(async () => {
  const remaining = MAX_PHOTOS - photoItems.length;
  if (remaining <= 0) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.85,
  });
  if (result.canceled) return;
  setPhotoItems((prev) => [
    ...prev,
    ...result.assets.map((a) => ({ kind: 'new' as const, localUri: a.uri })),
  ]);
}, [photoItems.length]);

const removePhoto = useCallback((index: number) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setPhotoItems((prev) => prev.filter((_, i) => i !== index));
}, []);

const handlePhotoDragEnd = useCallback(({ data }: { data: PhotoItem[] }) => {
  setPhotoItems(data);
}, []);

const renderPhotoItem = useCallback(
  ({ item, drag, isActive, getIndex }: RenderItemParams<PhotoItem>) => {
    const uri = item.kind === 'existing' ? item.url : item.localUri;
    const index = getIndex() ?? 0;
    return (
      <TouchableOpacity
        onLongPress={drag}
        disabled={isActive}
        activeOpacity={0.9}
        style={[styles.photoSlot, isActive && styles.photoSlotActive]}
      >
        <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
        <View style={[styles.orderBadge, { backgroundColor: colors.brand.purple }]}>
          <Text style={styles.orderBadgeText}>{index + 1}</Text>
        </View>
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => removePhoto(index)}
          hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
          accessibilityLabel={`Remove photo ${index + 1}`}
        >
          <X size={12} color="#fff" weight="bold" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  },
  [colors, removePhoto],
);
```

- [ ] **Step 4: Render the photo strip (photo posts only) below the place row**

Insert this JSX in the `ScrollView`, immediately after the `{post.mediaType === 'photo' && (...place row...)}`
block and before the `<Button label="Delete post" .../>`:

```tsx
{post.mediaType === 'photo' && (
  <View style={styles.photoSection}>
    <Text style={[styles.photoSectionLabel, { color: colors.text.tertiary }]}>
      PHOTOS · DRAG TO REORDER · FIRST IS THE COVER
    </Text>
    <DraggableFlatList
      data={photoItems}
      horizontal
      keyExtractor={(item, index) => `${item.kind === 'existing' ? item.url : item.localUri}-${index}`}
      renderItem={renderPhotoItem}
      onDragEnd={handlePhotoDragEnd}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.photoStrip}
      ListFooterComponent={
        photoItems.length < MAX_PHOTOS ? (
          <TouchableOpacity
            style={[styles.addMoreBtn, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder }]}
            onPress={pickMorePhotos}
            activeOpacity={0.75}
          >
            <Images size={24} color={colors.text.secondary} weight="duotone" />
            <Text style={[styles.addMoreText, { color: colors.text.secondary }]}>Add more</Text>
          </TouchableOpacity>
        ) : null
      }
    />
    {isSaving && uploadProgress > 0 && (
      <View style={[styles.progressTrack, { backgroundColor: colors.background.sunken }]}>
        <View style={[styles.progressFill, { width: `${uploadProgress}%`, backgroundColor: colors.brand.purple }]} />
      </View>
    )}
  </View>
)}
```

- [ ] **Step 5: Wire photo edits into Save, and disable Save when the photo list would be empty**

Replace the `handleSave` callback with:

```ts
const canSave = post?.mediaType !== 'photo' || photoItems.length > 0;

const handleSave = useCallback(async () => {
  if (!post || !canSave) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  try {
    if (caption !== (post.caption ?? '')) {
      await updateCaption(caption);
    }
    if (post.mediaType === 'photo') {
      if (placeName !== (post.placeName ?? '')) {
        await updatePlace(placeName.trim() || null);
      }
      await updatePhotos(photoItems);
    }
    router.back();
  } catch (e: unknown) {
    Alert.alert('Save failed', e instanceof Error ? e.message : 'Check your connection and try again.');
  }
}, [post, canSave, caption, placeName, photoItems, updateCaption, updatePlace, updatePhotos, router]);
```

And update the Save button's `disabled` prop in the header:

```tsx
<TouchableOpacity style={styles.headerBtn} onPress={handleSave} disabled={isSaving || !canSave} activeOpacity={0.7}>
```

- [ ] **Step 6: Add the new styles**

Add to the `StyleSheet.create` block in `app/post/edit/[id].tsx`:

```ts
const THUMB_SIZE = 100;
```

(module-level, alongside `MAX_PHOTOS`)

```ts
  photoSection: { marginTop: Spacing['2'] },
  photoSectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['3'],
  },
  photoStrip: { paddingHorizontal: Spacing['5'], gap: Spacing['2'] },
  photoSlot: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginRight: Spacing['2'],
  },
  photoSlotActive: { opacity: 0.85 },
  photoThumb: { width: '100%', height: '100%' },
  orderBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadgeText: { fontSize: 11, fontWeight: FontWeight.bold, color: '#fff' },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addMoreText: { fontSize: FontSize.xs },
  progressTrack: {
    height: 4,
    marginHorizontal: Spacing['5'],
    marginTop: Spacing['3'],
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: BorderRadius.full },
```

- [ ] **Step 7: Manually verify**

Run: `npx expo start --ios`.

1. Open a photo post you own with 3+ photos, tap the pencil icon.
2. Long-press a thumbnail and drag it to a different position — confirm the order-number badges update
   and the drag feels responsive.
3. Tap "Add more", pick 1–2 new photos — confirm they append to the strip.
4. Remove a photo via its × button.
5. Tap Save. Confirm the post detail screen and the profile grid now show the new first photo as the
   cover, and reopening the edit screen shows the new photo order and the added/removed photos
   persisted.
6. Remove photos down to a single one — confirm Save still works. Then remove that last one too and
   confirm the Save button becomes disabled (can't publish a photo post with zero photos).

- [ ] **Step 8: Run the full test suite**

Run: `npm test -- --watchAll=false`
Expected: all tests still pass — this task adds no new pure logic beyond what Task 4 already covers.

- [ ] **Step 9: Commit**

```bash
git add app/post/edit/[id].tsx
git commit -m "feat: add photo add/remove/reorder to the post edit screen"
```

---

### Task 7: Comment edit/delete for the comment's own author

**Files:**
- Modify: `app/post/[id].tsx`

**Interfaces:**
- None new — uses `Comment` (`@/types`), and the already-imported `updateDoc`, `deleteDoc`, `doc`,
  `db` in this file.

- [ ] **Step 1: Add the new icon import**

In `app/post/[id].tsx`, add `TrashSimple` to the existing `phosphor-react-native` import line:

```ts
import { MapTrifold, ArrowLeft, MapPin, ArrowRight, PencilSimple, TrashSimple } from 'phosphor-react-native';
```

- [ ] **Step 2: Rewrite `CommentRow` to support self-edit/delete**

Replace the existing `CommentRow` function with:

```tsx
function CommentRow({ comment, postId, currentUid }: { comment: Comment; postId: string; currentUid: string }) {
  const { colors } = useTheme();
  const isMine = !!currentUid && comment.authorUid === currentUid;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft(comment.text);
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = async () => {
    if (!draft.trim() || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      await updateDoc(doc(db, 'posts', postId, 'comments', comment.id), { text: draft.trim() });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete this comment?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteDoc(doc(db, 'posts', postId, 'comments', comment.id));
        },
      },
    ]);
  };

  return (
    <View style={styles.commentRow}>
      <Avatar uri={comment.authorAvatarUrl} name={comment.authorDisplayName} size="xs" />
      <View style={styles.commentContent}>
        <Text style={[styles.commentAuthor, { color: colors.text.primary }]}>
          {comment.authorDisplayName}
        </Text>
        {isEditing ? (
          <View style={styles.commentEditBlock}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              style={[styles.commentEditInput, { color: colors.text.primary, borderColor: colors.background.cardBorder }]}
              multiline
              maxLength={500}
              autoFocus
            />
            <View style={styles.commentEditActions}>
              <TouchableOpacity onPress={cancelEdit} hitSlop={8}>
                <Text style={[styles.commentEditActionText, { color: colors.text.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} disabled={saving} hitSlop={8}>
                <Text style={[styles.commentEditActionText, { color: colors.brand.purple }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[styles.commentText, { color: colors.text.secondary }]}>
            {comment.text}
          </Text>
        )}
      </View>
      {!isEditing && (
        <View style={styles.commentMeta}>
          <Text style={[styles.commentTime, { color: colors.text.tertiary }]}>
            {formatTimestamp(comment.createdAt as unknown as { toDate?: () => Date })}
          </Text>
          {isMine && (
            <View style={styles.commentOwnerActions}>
              <TouchableOpacity onPress={startEdit} hitSlop={8} accessibilityLabel="Edit comment">
                <PencilSimple size={13} color={colors.text.tertiary} weight="regular" />
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} hitSlop={8} accessibilityLabel="Delete comment">
                <TrashSimple size={13} color={colors.text.tertiary} weight="regular" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Update the call site to pass the two new props**

In the same file, find where comments are rendered (`{comments.map((c) => (<CommentRow key={c.id} comment={c} />))}`)
and change it to:

```tsx
{comments.map((c) => (
  <CommentRow key={c.id} comment={c} postId={id!} currentUid={uid} />
))}
```

(`id` and `uid` are already in scope in this component from `useLocalSearchParams` and `useAuthStore`.)

- [ ] **Step 4: Add the new comment styles**

Add to the `StyleSheet.create` block in `app/post/[id].tsx`:

```ts
  commentMeta: { alignItems: 'flex-end', gap: 6 },
  commentOwnerActions: { flexDirection: 'row', gap: 10 },
  commentEditBlock: { gap: 6 },
  commentEditInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    fontSize: FontSize.sm,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  commentEditActions: { flexDirection: 'row', gap: Spacing['4'] },
  commentEditActionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
```

- [ ] **Step 5: Manually verify**

Run: `npx expo start --ios`.

1. Open any post and add a comment from your account.
2. Confirm your own comment shows a pencil and trash icon; tap the pencil, edit the text, tap Save —
   confirm the comment text updates immediately (comments are `onSnapshot`-driven, no reload needed).
3. Tap the trash icon on your comment, confirm the alert, confirm deletion — the comment disappears
   immediately and the count above the list decreases.
4. Using a second test account (or another user's existing comment on a post), confirm that comment
   shows **no** pencil/trash icons.

- [ ] **Step 6: Run the full test suite**

Run: `npm test -- --watchAll=false`
Expected: all tests pass — this task is pure Firestore CRUD wiring with no new extractable logic,
consistent with how comment *creation* (`handleSubmitComment`) in this same file was never unit-tested
either.

- [ ] **Step 7: Commit**

```bash
git add app/post/[id].tsx
git commit -m "feat: let comment authors edit or delete their own comments"
```

---

## Final Verification

- [ ] Run `npm run lint` — expect no new errors introduced by this plan's files.
- [ ] Run `npm test -- --watchAll=false` — expect all tests passing (7 new: 3 in `posts.test.ts`, 3 in
  `useEditPost.test.ts`, plus whatever existed before).
- [ ] Run through the `supernova-design` skill's pre-ship checklist against `app/post/edit/[id].tsx` and
  the comment row changes in `app/post/[id].tsx` before considering this done.
- [ ] End-to-end walkthrough in the simulator: create a photo post, edit its caption/place/photos,
  reorder photos, delete a photo, comment on a post, edit your comment, delete your comment, share a
  trip to the feed and confirm it appears once (Trips tab only, not Posts), delete the post entirely.
