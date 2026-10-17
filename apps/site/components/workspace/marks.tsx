import { IconFlag, IconPencil } from "@/components/icons";
import type { Fact } from "@/lib/types";

export const KIND_LABEL: Record<string, string> = { decision: "Decision", commitment: "Commitment", fact: "Fact" };

/** Status as a mark plus words: tape for in force, a strike for superseded, a flag for review, a pencil outline for drafts. */
export function StatusMark({ fact, at }: { fact: Pick<Fact, "status" | "valid_to">; at?: number }) {
  if (fact.status === "retracted") return <span className="mark-superseded text-[0.84rem]">Retracted</span>;
  const endedBy = fact.valid_to !== null && (at === undefined || fact.valid_to <= at);
  if (fact.status === "superseded" || endedBy) return <span className="mark-superseded text-[0.84rem]">Superseded</span>;
  return <span className="mark-current text-[0.8rem]">In force</span>;
}

export function ReviewMark({ children = "Needs review" }: { children?: React.ReactNode }) {
  return (
    <span className="mark-review text-[0.86rem]">
      <IconFlag size={15} /> {children}
    </span>
  );
}

export function DraftMark() {
  return (
    <span className="mark-draft text-[0.84rem]">
      <IconPencil size={14} /> Unsent draft
    </span>
  );
}
