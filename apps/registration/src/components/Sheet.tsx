'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A bottom sheet.
 *
 * It portals into document.body rather than rendering in place, and it has to:
 * the question area animates in with a transform, and a transformed ancestor
 * becomes the containing block for `position: fixed`. A sheet rendered inline
 * would be trapped inside the scrolling panel instead of covering the screen.
 */
export default function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  // Portalling needs the DOM, so nothing renders into body until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes, and the page behind must not scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="sheetwrap" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="sheetscrim" aria-label="Close" onClick={onClose} />
      <div className="sheet">{children}</div>
    </div>,
    document.body,
  );
}
