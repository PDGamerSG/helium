import type { Metadata } from "next";
import { AgentsPage } from "@/components/workspace/AgentsPage";

export const metadata: Metadata = { title: "Crew" };

export default function Agents() {
  return <AgentsPage />;
}
