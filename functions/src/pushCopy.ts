/**
 * Push wording: the title says who did what, the body quotes what it was
 * about — so the notification explains itself on the lock screen. Pure, like
 * pushData.ts.
 */
type Copy = { title: string; body: string };

function quote(text: string | undefined | null, max = 80): string | null {
  const t = (text ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  return `“${t.length > max ? `${t.slice(0, max).trimEnd()}…` : t}”`;
}

export function likePushCopy(likerName: string, caption?: string | null): Copy {
  return { title: `${likerName} liked your post`, body: quote(caption) ?? 'Tap to see it' };
}

export function commentLikePushCopy(likerName: string, comment: string): Copy {
  return { title: `${likerName} liked your comment`, body: quote(comment) ?? 'Tap to see it' };
}

export function commentPushCopy(type: 'post_comment' | 'comment_reply', name: string, comment: string): Copy {
  return {
    title: type === 'comment_reply' ? `${name} replied to your comment` : `${name} commented on your post`,
    body: quote(comment) ?? 'Tap to see it',
  };
}
