import { cn } from '@/lib/utils/index';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-vault-pulse rounded-md bg-vault-bg-surface',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
