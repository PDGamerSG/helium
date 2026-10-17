import type { Metadata } from "next";
import { SourcesPage } from "@/components/workspace/SourcesPage";

export const metadata: Metadata = { title: "Evidence" };

export default function Sources() {
  return <SourcesPage />;
}
