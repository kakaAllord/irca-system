'use client';

import { useState } from 'react';
import { Input, type InputProps } from './Input';

/** A password field with a Show/Hide toggle, so people can check what they typed. */
export function PasswordInput(props: Omit<InputProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="rounded-md px-2 py-1 text-[11.5px] font-medium text-fg2 hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}
