import type { ApiError } from "@/lib/api";
import { IconRefresh } from "@/components/icons";

export function Loading({ label = "Loading", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-[10px] bg-[rgb(14_14_16/0.04)]" style={{ animationDelay: `${i * 90}ms`, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "This didn't load" }: { error: ApiError; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="rounded-[10px] border border-[rgb(217_45_32/0.4)] bg-[rgb(217_45_32/0.06)] p-5">
      <p className="font-semibold text-coal">{title}</p>
      <p className="mt-1 text-[0.95rem] text-coal-2">{error.message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn btn-line btn-sm mt-4">
          <IconRefresh size={15} /> Try again
        </button>
      ) : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[rgb(14_14_16/0.18)] p-6">
      <p className="font-semibold text-coal">{title}</p>
      {children ? <div className="mt-1.5 text-[0.95rem] text-coal-2">{children}</div> : null}
    </div>
  );
}
