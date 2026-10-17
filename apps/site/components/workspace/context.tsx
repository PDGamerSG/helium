"use client";

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { ChatResponse } from "@/lib/types";

export type Drawer = { kind: "why"; id: string } | { kind: "ask"; question?: string; nonce: number } | null;
export type Turn = { q: string; res?: ChatResponse; error?: string };

export type WorkspaceCtx = {
  tenant: string;
  drawer: Drawer;
  openWhy: (id: string) => void;
  openAsk: (question?: string) => void;
  close: () => void;
  chatTurns: Turn[];
  setChatTurns: Dispatch<SetStateAction<Turn[]>>;
};

export const Workspace = createContext<WorkspaceCtx | null>(null);

export function useWorkspace() {
  const ctx = useContext(Workspace);
  if (!ctx) throw new Error("useWorkspace must be used inside the workspace shell");
  return ctx;
}
