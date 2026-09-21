'use client';

import { Dialog as HeadlessDialog, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';

/**
 * A dialog that behaves: focus moves into it, Escape closes it, the page
 * behind does not scroll, and focus returns where it came from. Headless UI
 * does that part; this is the look.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="w-full max-w-lg rounded-[12px] border border-border bg-surface p-5 shadow-xl">
          <DialogTitle className="text-[15px] font-semibold text-fg">{title}</DialogTitle>
          {description && <div className="mt-1.5 text-[12.5px] text-fg2">{description}</div>}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}
