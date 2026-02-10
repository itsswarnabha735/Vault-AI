import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/index';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-vault-gold-muted text-vault-gold-secondary',
        secondary:
          'border-transparent bg-vault-bg-surface text-vault-text-secondary',
        destructive:
          'border-transparent bg-vault-danger-muted text-vault-danger-text',
        outline: 'border-[rgba(255,255,255,0.10)] text-vault-text-primary',
        success:
          'border-transparent bg-vault-success-muted text-vault-success-text',
        warning:
          'border-transparent bg-vault-warning-muted text-vault-warning-text',
        info: 'border-transparent bg-vault-info-muted text-vault-info-text',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
