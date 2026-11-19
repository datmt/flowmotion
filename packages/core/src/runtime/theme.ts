import type { NodeKind, StateName, Tone } from "../schema.ts";

export type Shape = "rounded" | "pill" | "diamond" | "cylinder" | "queue" | "actor" | "dashed" | "circle";
export interface StateColors { fill: string; stroke: string; text: string }
export interface Theme {
  bg: string; text: string; muted: string; edge: string; packet: string; token: string; callout: { fill: string; text: string };
  group: { fill: string; stroke: string; label: string };
  cell: { fill: string; stroke: string; text: string; key: string };
  code: { bg: string; text: string; highlight: string; gutter: string };
  state: Record<StateName, StateColors>;
  tone: Record<Tone, StateColors>; // replaces the idle look of a node/group; other states still win
}

const sc = (fill: string, stroke: string, text: string): StateColors => ({ fill, stroke, text });

export const themes: Record<"light" | "dark", Theme> = {
  light: {
    bg: "#ffffff", text: "#1f2937", muted: "#6b7280", edge: "#94a3b8", packet: "#2563eb", token: "#7c3aed",
    callout: { fill: "#fef3c7", text: "#78350f" },
    group: { fill: "#f8fafc", stroke: "#cbd5e1", label: "#64748b" },
    cell: { fill: "#f1f5f9", stroke: "#94a3b8", text: "#1f2937", key: "#64748b" },
    code: { bg: "#f8fafc", text: "#1f2937", highlight: "#fde68a", gutter: "#94a3b8" },
    state: {
      idle: sc("#f1f5f9", "#94a3b8", "#1f2937"), active: sc("#dbeafe", "#2563eb", "#1e3a8a"),
      success: sc("#dcfce7", "#16a34a", "#14532d"), error: sc("#fee2e2", "#dc2626", "#7f1d1d"),
      warning: sc("#fef3c7", "#d97706", "#78350f"), pending: sc("#ede9fe", "#7c3aed", "#4c1d95"),
      disabled: sc("#f8fafc", "#cbd5e1", "#9ca3af"),
    },
    tone: { primary: sc("#1d4ed8", "#1e3a8a", "#ffffff"), muted: sc("#ffffff", "#e2e8f0", "#94a3b8"), danger: sc("#fff1f2", "#e11d48", "#9f1239") },
  },
  dark: {
    bg: "#0f172a", text: "#e2e8f0", muted: "#94a3b8", edge: "#64748b", packet: "#60a5fa", token: "#a78bfa",
    callout: { fill: "#78350f", text: "#fef3c7" },
    group: { fill: "#1e293b", stroke: "#334155", label: "#94a3b8" },
    cell: { fill: "#1e293b", stroke: "#64748b", text: "#e2e8f0", key: "#94a3b8" },
    code: { bg: "#1e293b", text: "#e2e8f0", highlight: "#854d0e", gutter: "#64748b" },
    state: {
      idle: sc("#1e293b", "#64748b", "#e2e8f0"), active: sc("#1e3a8a", "#60a5fa", "#dbeafe"),
      success: sc("#14532d", "#4ade80", "#dcfce7"), error: sc("#7f1d1d", "#f87171", "#fee2e2"),
      warning: sc("#78350f", "#fbbf24", "#fef3c7"), pending: sc("#4c1d95", "#a78bfa", "#ede9fe"),
      disabled: sc("#0f172a", "#334155", "#64748b"),
    },
    tone: { primary: sc("#3b82f6", "#93c5fd", "#0f172a"), muted: sc("#0f172a", "#1e293b", "#64748b"), danger: sc("#4c0519", "#fb7185", "#ffe4e6") },
  },
};

/** Node shape and minimum size per kind. No per-entity colors (PRD §13). */
export const kinds: Record<NodeKind, { shape: Shape; minW: number; minH: number }> = {
  service: { shape: "rounded", minW: 120, minH: 56 },
  state: { shape: "pill", minW: 100, minH: 44 },
  decision: { shape: "diamond", minW: 120, minH: 80 },
  db: { shape: "cylinder", minW: 100, minH: 72 },
  queue: { shape: "queue", minW: 120, minH: 48 },
  actor: { shape: "actor", minW: 90, minH: 80 },
  external: { shape: "dashed", minW: 120, minH: 56 },
  value: { shape: "circle", minW: 48, minH: 48 },
};

export const metrics = {
  fonts: { ui: "Inter", mono: "JetBrains Mono" },
  iconSize: 20, iconGap: 8, labelSize: 14, labelLineHeight: 18, nodePadX: 16, nodePadY: 10,
  cell: { w: 56, h: 44, gap: 4 }, codeLineHeight: 20, codeSize: 13, codePad: 12,
  edgeLabelSize: 12, groupPad: 24,
} as const;

export const aspects = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1, "9:16": 9 / 16 } as const;
