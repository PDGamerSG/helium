import type { Metadata } from "next";
import { Directory } from "@/components/workspace/Directory";

export const metadata: Metadata = { title: "Teams" };

export default function WorkspaceDirectory() {
  return <Directory />;
}
