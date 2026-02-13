import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

interface NeoSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Override shimmer accent color class. Defaults to page accent. */
  shimmerColor?: string;
}

function NeoSkeleton({ className, shimmerColor = 'bg-page', style, ...props }: NeoSkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden border-3 border-border bg-background shadow-neo-sm',
        className,
      )}
      style={style}
      {...props}
    >
      {/* Shimmer sweep */}
      <div className='absolute inset-0 animate-neo-shimmer'>
        <div className={cn('h-full w-1/2 opacity-[0.12]', shimmerColor)} style={{ filter: 'blur(16px)' }} />
      </div>
      {/* Subtle static tint */}
      <div className={cn('absolute inset-0 opacity-[0.04]', shimmerColor)} />
    </div>
  );
}

export { Skeleton, NeoSkeleton };
