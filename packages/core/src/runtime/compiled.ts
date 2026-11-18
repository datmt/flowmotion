import type { NodeKind, StateName } from "../schema.ts";

export type Rect = { x: number; y: number; w: number; h: number };
export type Ease = "linear" | "inOut" | "spring";

export interface CompiledFlow {
  version: "2.1";
  meta: { title: string; summary?: string; theme: "light" | "dark"; aspect: "16:9" | "4:3" | "1:1" | "9:16" };
  bounds: Rect; // whole diagram incl. hidden entities
  groups: { id: string; label: string; rect: Rect }[];
  nodes: { id: string; kind: NodeKind; rect: Rect }[];
  edges: { id: string; from: string; to: string; arrow: boolean; dashed: boolean; points: number[]; length: number; labelAt: { x: number; y: number } }[];
  arrays: { id: string; label?: string; rect: Rect; orientation: "row" | "column"; keys?: string[]; slots: Rect[] }[];
  grids: { id: string; label?: string; rect: Rect; rows: number; cols: number; rowLabels?: string[]; colLabels?: string[]; slots: Rect[] }[];
  code: { id: string; title?: string; rect: Rect; lines: { text: string; color: string }[][] }[];
  tokens: { id: string; label?: string }[];
  lifelines?: { id: string; x: number; y0: number; y1: number }[]; // sequence layout only
  scenarios: CompiledScenario[];
}

export interface CompiledScenario {
  id: string; title: string; duration: number;
  steps: { id: string; title: string; narration: string; start: number; end: number; inherited: boolean; changes: StepChange[]; branches: { scenario: string; title: string }[] }[];
  cells: { id: string; owner: string }[]; // cell instances, e.g. "nums@3" owned by "nums"
  tracks: Track[];
  packets: { edge: string; reverse: boolean; t0: number; t1: number; ease: Ease; label?: string }[];
  pulses: { target: string; t0: number; t1: number }[];
  callouts: { target: string; text: string; t0: number; t1: number }[];
  camera: { t0: number; t1: number; ease: Ease; rect: Rect | null; dim: string[] }[]; // null = full view
}

/** One settled value change inside a step. `target` is a cell's key (`vars#lo`) when its array has keys, else the entity/cell id. */
export interface StepChange { target: string; prop: "state" | "label" | "at" | "visible"; from: string | boolean; to: string | boolean }
export type TrackProp = "state" | "visible" | "label" | "slot" | "at" | "lines";
export type TokenAt = { target: string } | { edge: string; reverse: boolean };
export interface Track {
  target: string; // entity id or cell instance id
  prop: TrackProp;
  init: StateName | boolean | string | number | TokenAt;
  keys: { t0: number; t1: number; ease: Ease; to: Track["init"] }[]; // sorted, non-overlapping per track
}
export type { NodeKind, StateName };
