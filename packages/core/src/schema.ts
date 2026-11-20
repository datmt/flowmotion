import { z } from "zod";
import { ICON_RE } from "./icons/index.ts";

export const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
// entity | id#3 | id#2..5 | id#key | id#1.2   (PRD §3.2)
export const REF_RE = /^[a-z][a-z0-9-]{0,39}(#(\d+\.\d+\.\.\d+\.\d+|\d+(\.\.\d+|\.\d+)?|[a-z][a-z0-9-]{0,39}))?$/;
const LINES_RE = /^(\d+(-\d+)?(,\d+(-\d+)?)*)?$/;

export const Id = z.string().regex(ID_RE);
export const Ref = z.string().max(90).regex(REF_RE);

export const NodeKind = z.enum(["service", "state", "decision", "db", "queue", "actor", "external", "value"]);
export const StateName = z.enum(["idle", "active", "success", "error", "warning", "pending", "disabled"]);
export const Tone = z.enum(["primary", "muted", "danger"]);
export const EffectName = z.enum(["shake", "grow", "fade", "flash"]);
const Ease = z.enum(["linear", "inOut", "spring"]);
const Pos = z.strictObject({ x: z.number(), y: z.number() });
const Cell = z.string().max(40);
const Targets = z.array(Ref).max(64);

export const Group = z.strictObject({ id: Id, label: z.string().min(1).max(40), tone: Tone.optional() });

export const Node = z.strictObject({
  id: Id,
  label: z.string().min(1).max(40),
  kind: NodeKind,
  icon: z.string().regex(ICON_RE).optional(), // "<pack>:<name>", e.g. "si:postgresql"
  group: Id.optional(),
  state: StateName.optional(),
  tone: Tone.optional(), // semantic emphasis; orthogonal to state (a non-idle state wins while it lasts)
  hidden: z.boolean().optional(),
  pos: Pos.optional(),
});

export const Edge = z.strictObject({
  id: Id.optional(),
  from: Id,
  to: Id,
  label: z.string().max(30).optional(),
  arrow: z.boolean().optional(),
  dashed: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export const ArrayEntity = z.strictObject({
  id: Id,
  label: z.string().max(40).optional(),
  values: z.array(Cell).max(64),
  keys: z.array(Id).max(64).optional(),
  orientation: z.enum(["row", "column"]).optional(),
  group: Id.optional(),
  hidden: z.boolean().optional(),
  pos: Pos.optional(),
});

export const GridEntity = z.strictObject({
  id: Id,
  label: z.string().max(40).optional(),
  rows: z.array(z.array(Cell).min(1).max(16)).min(1).max(16),
  rowLabels: z.array(z.string().max(20)).max(16).optional(),
  colLabels: z.array(z.string().max(20)).max(16).optional(),
  group: Id.optional(),
  hidden: z.boolean().optional(),
  pos: Pos.optional(),
});

export const Token = z.strictObject({
  id: Id,
  label: z.string().max(20).optional(),
  at: Ref,
  hidden: z.boolean().optional(),
});

export const CodeBlock = z.strictObject({
  id: Id,
  title: z.string().max(60).optional(),
  language: z.string().min(1).max(30),
  code: z.string().max(8000), // line count (≤ 80) checked in F02
  hidden: z.boolean().optional(),
  pos: Pos.optional(),
});

const timing = {
  start: z.enum(["after", "with"]).optional(),
  delay: z.number().min(0).max(30).optional(),
  dur: z.number().min(0.05).max(30).optional(),
  ease: Ease.optional(),
};

export const Action = z.discriminatedUnion("do", [
  z.strictObject({ do: z.literal("state"), targets: Targets, state: StateName, ...timing }),
  z.strictObject({ do: z.literal("show"), targets: Targets, ...timing }),
  z.strictObject({ do: z.literal("hide"), targets: Targets, ...timing }),
  z.strictObject({ do: z.literal("label"), target: Ref, text: z.string().max(60), ...timing }),
  z.strictObject({ do: z.literal("pulse"), targets: Targets, ...timing }),
  z.strictObject({ do: z.literal("effect"), targets: Targets, name: EffectName, ...timing }),
  z.strictObject({ do: z.literal("focus"), targets: Targets, dim: z.boolean().optional(), ...timing }),
  z.strictObject({ do: z.literal("callout"), target: Ref, text: z.string().max(120), ...timing }),
  z.strictObject({
    do: z.literal("send"), from: Id, to: Id, via: Id.optional(),
    label: z.string().max(30).optional(), token: Id.optional(), ...timing,
  }),
  z.strictObject({ do: z.literal("move"), token: Id, to: Ref, ...timing }),
  z.strictObject({ do: z.literal("swap"), a: Ref, b: Ref, ...timing }),
  z.strictObject({ do: z.literal("values"), target: Id, values: z.array(Cell).max(64), ...timing }),
  z.strictObject({ do: z.literal("highlight"), target: Id, lines: z.string().max(60).regex(LINES_RE), ...timing }),
]);

export const Step = z.strictObject({
  id: Id,
  title: z.string().min(1).max(60),
  narration: z.string().min(1).max(400),
  detail: z.string().min(1).max(1200).optional(), // "Learn more" text under the narration; same `code` and **bold** markup
  actions: z.array(Action).max(12),
  hold: z.number().min(0).max(30).optional(),
});

export const Scenario = z.strictObject({
  id: Id,
  title: z.string().min(1).max(80),
  branchFrom: z.strictObject({ scenario: Id, afterStep: Id }).optional(),
  steps: z.array(Step).min(1).max(40),
});

export const FlowDoc = z.strictObject({
  version: z.literal("2.1"),
  meta: z.strictObject({
    title: z.string().min(1).max(80),
    summary: z.string().max(280).optional(),
    tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(8).optional(),
    level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    sources: z.array(z.string().url()).max(10).optional(), // where the facts come from; reviewers check the flow against these
    related: z.array(z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/)).max(8).optional(), // catalog paths `<domain>/<slug>`
    theme: z.enum(["light", "dark"]).optional(),
    aspect: z.enum(["16:9", "4:3", "1:1", "9:16"]).optional(),
  }),
  layout: z.strictObject({
    algorithm: z.enum(["layered", "tree", "stress", "sequence"]).optional(),
    direction: z.enum(["LR", "TB"]).optional(),
    edges: z.enum(["orthogonal", "straight"]).optional(), // straight = diagonal lines, best for fully connected graphs (neural nets)
  }).optional(),
  groups: z.array(Group).optional(),
  nodes: z.array(Node),
  edges: z.array(Edge),
  arrays: z.array(ArrayEntity).optional(),
  grids: z.array(GridEntity).optional(),
  tokens: z.array(Token).optional(),
  code: z.array(CodeBlock).optional(),
  scenarios: z.array(Scenario).min(1).max(8),
});

export type FlowDoc = z.infer<typeof FlowDoc>;
export type Action = z.infer<typeof Action>;
export type NodeKind = z.infer<typeof NodeKind>;
export type Tone = z.infer<typeof Tone>;
export type EffectName = z.infer<typeof EffectName>;
export type StateName = z.infer<typeof StateName>;
export type Node = z.infer<typeof Node>;
export type Edge = z.infer<typeof Edge>;
export type Step = z.infer<typeof Step>;
export type Scenario = z.infer<typeof Scenario>;

/** Fully inlined JSON Schema (no $ref/$defs) for strict structured output / MCP inputSchema. */
export function flowJsonSchema() {
  return z.toJSONSchema(FlowDoc, { io: "input", reused: "inline", target: "draft-7" });
}
