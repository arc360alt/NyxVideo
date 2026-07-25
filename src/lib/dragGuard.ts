/** Suppresses text selection for the duration of a pointer drag; call the returned fn on pointerup. */
export function beginDragGuard(): () => void {
  const prevUserSelect = document.body.style.userSelect;
  const prevCursor = document.body.style.cursor;
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';
  return () => {
    document.body.style.userSelect = prevUserSelect;
    document.body.style.cursor = prevCursor;
  };
}
