import type { Ease } from "./compiled.ts";

const W = 9; // critically-damped spring rate; normalised so it lands exactly on 1
const spr = (t: number) => 1 - (1 + W * t) * Math.exp(-W * t);

export function ease(kind: Ease, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (kind === "linear") return t;
  if (kind === "spring") return spr(t) / spr(1);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
