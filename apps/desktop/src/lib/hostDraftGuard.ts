// Editor-only drafts must never enter project documents or runtime exports.
const guards = new Map<symbol, { dirty: () => boolean; discard: () => void }>();
export function registerHostDraft(guard: {
  dirty: () => boolean;
  discard: () => void;
}) {
  const id = Symbol();
  guards.set(id, guard);
  return () => {
    guards.delete(id);
  };
}
export function hasInvalidHostDraft() {
  return [...guards.values()].some((guard) => guard.dirty());
}
export function confirmDiscardHostDraft() {
  if (!hasInvalidHostDraft()) return true;
  const message =
    "宿主消息存在无效 JSON，当前输入尚未保存。放弃这些输入并继续吗？";
  if (
    !window.confirm(
      document.documentElement.lang === "en-US"
        ? "Host messages contain invalid JSON that has not been saved. Discard this input and continue?"
        : message,
    )
  )
    return false;
  for (const guard of guards.values()) if (guard.dirty()) guard.discard();
  return true;
}
