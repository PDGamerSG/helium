import type { Metadata } from "next";
import { ImpactPage } from "@/components/workspace/ImpactPage";

export const metadata: Metadata = { title: "Changes" };

export default function Impact() {
  return <ImpactPage />;
}
