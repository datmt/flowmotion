import Konva from "konva";
import { sample } from "@flowmotion/core/runtime";
import type { CompiledFlow, FrameState } from "@flowmotion/core/runtime";
import { buildScene } from "./scene.ts";

export interface PlayerOptions { mode?: "step" | "play"; scenario?: string; step?: number; reducedMotion?: boolean; onStep?: (step: number, scenario: string) => void; onTime?: (t: number, playing: boolean) => void }
export interface Player {
  readonly stage: Konva.Stage;
  readonly compiled: CompiledFlow;
  readonly t: number; readonly playing: boolean; readonly scenario: string; readonly step: number; readonly duration: number;
  frame(): FrameState;
  play(): void; pause(): void; seek(t: number): void; setSpeed(x: number): void; setMode(m: "step" | "play"): void;
  next(): void; prev(): void; goToStep(i: number | string): void; setScenario(id: string): void; resize(): void; destroy(): void;
}

/** Framework-free Konva player. Clock = requestAnimationFrame; every frame is sample() → setAttrs() → draw. */
export function createPlayer(container: HTMLDivElement, compiled: CompiledFlow, opts: PlayerOptions = {}): Player {
  const stage = new Konva.Stage({ container, width: container.clientWidth || 640, height: container.clientHeight || 360 });
  let mode = opts.mode ?? "step", scenario = opts.scenario ?? compiled.scenarios[0]!.id, speed = 1, t = 0, playing = false, stopAt: number | undefined, raf = 0, last = 0, step = 0;
  let scene = buildScene(compiled, scenario, stage);
  const sc = () => compiled.scenarios.find((s) => s.id === scenario)!;
  const reduced = () => opts.reducedMotion ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  let fr: FrameState;

  const stepAt = (time: number) => { const ss = sc().steps; const i = ss.findIndex((s) => time < s.end); return i < 0 ? ss.length - 1 : i; };
  const render = () => {
    fr = sample(compiled, scenario, t, { reducedMotion: reduced() });
    scene.update(fr);
    opts.onTime?.(t, playing);
  };
  const setStep = (i: number) => { if (i !== step) { step = i; opts.onStep?.(i, scenario); } };
  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1) * speed; last = now;
    t = Math.min(t + dt, stopAt ?? sc().duration);
    if (stopAt === undefined) setStep(stepAt(t));
    render();
    if (t >= (stopAt ?? sc().duration)) { playing = false; stopAt = undefined; render(); return; }
    raf = requestAnimationFrame(tick);
  };
  const p: Player = {
    stage, compiled,
    get t() { return t; }, get playing() { return playing; }, get scenario() { return scenario; }, get step() { return step; }, get duration() { return sc().duration; },
    frame: () => fr,
    play() {
      if (playing) return;
      if (t >= sc().duration) t = 0;
      if (mode === "step") stopAt = sc().steps[step]!.end > t ? sc().steps[step]!.end : undefined; // finish the current step
      playing = true; last = performance.now(); raf = requestAnimationFrame(tick);
    },
    pause() { playing = false; stopAt = undefined; cancelAnimationFrame(raf); render(); },
    seek(time) { cancelAnimationFrame(raf); playing = false; stopAt = undefined; t = Math.min(Math.max(time, 0), sc().duration); setStep(stepAt(t)); render(); },
    setSpeed(x) { speed = Math.min(2, Math.max(0.5, x)); },
    setMode(m) { mode = m; },
    next() { const ss = sc().steps; const i = ss.findIndex((s) => s.end > t + 1e-6 && (s.start >= t - 1e-6 || s.end > t)); if (i < 0) return; cancelAnimationFrame(raf); step = i; opts.onStep?.(i, scenario); t = Math.max(t, ss[i]!.start); stopAt = ss[i]!.end; playing = true; last = performance.now(); raf = requestAnimationFrame(tick); },
    prev() { const ss = sc().steps; p.goToStep(Math.max(0, (t - ss[step]!.start > 0.3 || playing ? step : step - 1))); },
    goToStep(i) { const ss = sc().steps; const k = typeof i === "number" ? i : ss.findIndex((s) => s.id === i); if (k < 0) return; p.seek(ss[k]!.start); step = k; opts.onStep?.(k, scenario); },
    setScenario(id) { if (id === scenario || !compiled.scenarios.some((s) => s.id === id)) return; cancelAnimationFrame(raf); playing = false; stopAt = undefined; scene.destroy(); scenario = id; scene = buildScene(compiled, id, stage); t = Math.min(t, sc().duration); step = stepAt(t); opts.onStep?.(step, id); render(); },
    resize() { stage.size({ width: container.clientWidth || 640, height: container.clientHeight || 360 }); render(); },
    destroy() { cancelAnimationFrame(raf); stage.destroy(); },
  };
  if (opts.step) { const i = opts.step; t = sc().steps[Math.min(i, sc().steps.length - 1)]!.start; step = i; }
  render();
  return p;
}
