/**
 * The Helium mark: an H whose left stem is hollow (what was true before) and whose right stem is solid (what is true now),
 * joined by an orange link, the supersession that connects them. Nothing is overwritten; the old value stays in outline.
 */
export function HeliumMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2.75" y="2.75" width="6.5" height="18.5" rx="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14.75" y="2" width="7.25" height="20" rx="3.625" fill="currentColor" />
      <rect x="9.25" y="10.75" width="5.5" height="2.5" fill="#ff5a1f" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <HeliumMark size={24} />
      <span className="text-[1.22rem] font-semibold leading-none tracking-[-0.035em]">Helium</span>
    </span>
  );
}
