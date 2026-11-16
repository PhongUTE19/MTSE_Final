/**
 * Manages Object URL creation and reference-counted revocation for draft receipt Blobs.
 * Object URLs are ephemeral per-session handles and are never persisted in IndexedDB.
 *
 * @param {{ createObjectURL: (blob: Blob) => string, revokeObjectURL: (url: string) => void }} [urls]
 */
export function createPreviewUrlManager(urls = typeof URL !== 'undefined' ? URL : null) {
  // Map<draftId, { url: string, blob: Blob, consumers: Set<string> }>
  const entries = new Map();

  function acquire(draftId, blob, consumerId = 'default') {
    if (!draftId || !blob || !urls?.createObjectURL) {
      return null;
    }

    const existing = entries.get(draftId);
    if (existing) {
      if (existing.blob === blob) {
        existing.consumers.add(consumerId);
        return existing.url;
      }
      // Preview Blob was replaced: revoke stale URL before issuing a new one.
      urls.revokeObjectURL?.(existing.url);
      entries.delete(draftId);
    }

    const url = urls.createObjectURL(blob);
    entries.set(draftId, {
      url,
      blob,
      consumers: new Set([consumerId]),
    });
    return url;
  }

  function release(draftId, consumerId = 'default') {
    const existing = entries.get(draftId);
    if (!existing) return false;

    existing.consumers.delete(consumerId);
    if (existing.consumers.size === 0) {
      urls?.revokeObjectURL?.(existing.url);
      entries.delete(draftId);
      return true;
    }
    return false;
  }

  function revokeDraft(draftId) {
    const existing = entries.get(draftId);
    if (!existing) return false;

    urls?.revokeObjectURL?.(existing.url);
    entries.delete(draftId);
    return true;
  }

  function revokeAll() {
    for (const existing of entries.values()) {
      urls?.revokeObjectURL?.(existing.url);
    }
    entries.clear();
  }

  function getActiveCount() {
    return entries.size;
  }

  return {
    acquire,
    release,
    revokeDraft,
    revokeAll,
    getActiveCount,
  };
}
