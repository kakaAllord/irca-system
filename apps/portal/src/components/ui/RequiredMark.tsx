/**
 * The red star that means "this one is not optional".
 *
 * Every form in the portal marks its required fields this way, so a field
 * without one is genuinely optional rather than merely unmarked. The word is
 * there for screen readers, which do not read a bare asterisk out usefully.
 */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-danger">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
