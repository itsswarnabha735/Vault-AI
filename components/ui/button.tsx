import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/index';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans text-sm font-medium tracking-[0.01em] transition-all duration-150 ease focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'gradient-vault text-[#0A0C10] font-semibold shadow-md hover:shadow-lg active:scale-[0.98] active:duration-100',
        destructive:
          'bg-vault-danger-muted text-vault-danger-text border border-[rgba(248,113,113,0.2)] shadow-sm hover:bg-[rgba(248,113,113,0.2)]',
        outline:
          'border border-[rgba(255,255,255,0.10)] bg-vault-bg-surface text-vault-text-primary shadow-sm hover:bg-vault-bg-hover hover:text-vault-text-primary',
        secondary:
          'bg-vault-bg-surface text-vault-text-primary border border-[rgba(255,255,255,0.10)] shadow-sm hover:bg-vault-bg-hover',
        ghost: 'text-vault-text-secondary hover:bg-vault-bg-surface hover:text-vault-text-primary',
        link: 'text-vault-gold underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-5 py-2.5',
        sm: 'h-8 rounded-sm px-3.5 py-1.5 text-xs',
        lg: 'h-10 rounded-md px-7 py-3.5 text-[15px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
