import * as React from 'react';

import { cn } from '@/lib/utils/index';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-vault-bg-tertiary px-3 py-1 font-sans text-base text-vault-text-primary shadow-inner transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-vault-text-primary placeholder:text-vault-text-tertiary focus-visible:border-[rgba(255,255,255,0.16)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vault-gold disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
