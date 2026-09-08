import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
      <div className="hidden w-72 shrink-0 flex-col gap-0.5 border-r border-border p-2 sm:flex">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}
