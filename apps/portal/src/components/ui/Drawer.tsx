'use client';

import {
  Dialog as HeadlessDialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import type { ReactNode } from 'react';

/**
 * A panel that slides in from the right, for anything you fill in.
 *
 * Every form in the portal opens this way, so filling something in always
 * feels the same and the page you were reading stays where it was behind it.
 * Plain yes-or-no confirmations keep the centred dialog: they are a question,
 * not a form, and they should interrupt.
 *
 * Headless UI does the behaviour — focus moves in and comes back, Escape
 * closes, the page behind does not scroll — and this is the shape of it. The
 * title, the body and the buttons are the same three parts as the dialog, so
 * swapping one for the other is a one-word change.
 */
export function Drawer({
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
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/40 duration-200 ease-out data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex justify-end">
        <DialogPanel
          transition
          className="flex h-full w-full max-w-[460px] flex-col border-l border-border bg-surface shadow-2xl duration-200 ease-out data-closed:translate-x-full"
        >
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[15px] font-semibold text-fg">{title}</DialogTitle>
              {description && <div className="mt-1 text-[12.5px] text-fg2">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-0.5 flex size-7 flex-none items-center justify-center rounded-[7px] text-fg3 hover:bg-hover hover:text-fg"
            >
              <span aria-hidden="true" className="text-[16px] leading-none">
                ×
              </span>
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">
              {footer}
            </footer>
          )}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}
