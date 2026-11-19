import { lazy, Suspense, useEffect, useRef, useState } from "react";
import * as db from "./db.ts";
import { getLocalIcons, localRefs, refresh as refreshIcons } from "./editor/localIcons.ts";

// Catalog: templates/<domain>/<slug>.flow. Raw DSL text; only the title is read up front (full parse is lazy, it pulls in core).
const raw = import.meta.glob<string>("../../../templates/*/*.flow", { eager: true, query: "?raw", import: "default" });
type Tpl = { domain: string; slug: string; title: string; dsl: string };
const catalog: Tpl[] = Object.entries(raw).map(([p, dsl]) => {
  const [domain, file] = p.split("/").slice(-2);
  return { domain: domain!, slug: file!.replace(/\.flow$/, ""), title: JSON.parse(/^flow\s+("(?:[^"\\]|\\.)*")/m.exec(dsl)?.[1] ?? '""') || file!, dsl };
}).sort((a, b) => a.domain.localeCompare(b.domain) || a.title.localeCompare(b.title));
const domains = new Map<string, Tpl[]>();
for (const t of catalog) domains.set(t.domain, [...(domains.get(t.domain) ?? []), t]);
const domainName = (d: string) => d.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
async function tplDoc(t: Tpl) {
  const { parseDsl } = await import("@flowmotion/core");
  const r = parseDsl(t.dsl);
  if (!r.doc) throw new Error(r.issues.map((i) => i.message).join("\n"));
  return r.doc;
}
const Player = "flow-player" as any; // custom element, see packages/player

const Editor = lazy(() => import("./editor/Editor.tsx")); // pulls core (zod/elk/shiki): keep off the first paint

export const link = "text-blue-600 hover:underline";
export const btn = "rounded-md border border-stone-400 bg-white px-3 py-1 text-sm hover:border-emerald-600";

function Sidebar() {
  const [flows, setFlows] = useState<db.LocalFlow[]>([]);
  useEffect(() => void db.list().then(setFlows), []);
  const here = location.pathname;
  const head = "cursor-pointer px-2 pb-1 text-xs font-bold uppercase tracking-wide text-stone-500";
  const item = (active: boolean) => `block truncate rounded-md px-2 py-1.5 text-sm ${active ? "bg-emerald-100 font-semibold text-emerald-900" : "hover:bg-stone-200/60"}`;
  return (
    <nav className="hidden w-64 shrink-0 overflow-auto border-r border-stone-300 bg-stone-100 p-3 md:block">
      <details open>
        <summary className={head}>My flows ({flows.length})</summary>
        {flows.length === 0 && <p className="px-2 pb-2 text-sm text-stone-400">Nothing yet</p>}
        {flows.map((f) => <a key={f.id} href={`/local/${f.id}`} className={item(here === `/local/${f.id}`)}>{f.doc?.meta?.title ?? f.id}</a>)}
      </details>
      <div className="mt-3">
        <div className={head}>Catalog ({catalog.length})</div>
        {[...domains].map(([d, ts]) => (
          <details key={d} open={here.startsWith(`/t/${d}/`)}>
            <summary className="cursor-pointer px-2 py-1 text-sm font-semibold text-stone-700">{domainName(d)} <span className="font-normal text-stone-400">({ts.length})</span></summary>
            <div className="ml-3 border-l border-stone-300 pl-1">
              {ts.map((t) => <a key={t.slug} href={`/t/${d}/${t.slug}`} className={item(here === `/t/${d}/${t.slug}`)}>{t.title}</a>)}
            </div>
          </details>
        ))}
      </div>
    </nav>
  );
}

export function Shell({ children, side = true }: { children: React.ReactNode; side?: boolean }) {
  return (
    <div className="flex h-screen flex-col bg-stone-50 text-stone-900">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-stone-300 bg-white px-5">
        <a href="/" className="text-lg font-bold tracking-tight">Flowmotion</a>
        <a href="/" className="rounded-md border border-stone-800 bg-emerald-100 px-3 py-1 text-sm font-medium shadow-[2px_2px_0_#1c1917]">Library</a>
      </header>
      <div className="flex min-h-0 flex-1">
        {side && <Sidebar />}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}

/** Share = POST /api/share, then copy the /v/:id link. */
async function share(doc: unknown, icons?: Record<string, unknown>): Promise<string> {
  const r = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc, icons }) });
  const b = await r.json();
  if (!r.ok) throw new Error(b.issues ? b.issues.map((i: any) => i.message).join("\n") : b.message ?? b.error);
  const url = `${location.origin}/v/${b.id}`;
  await navigator.clipboard?.writeText(url).catch(() => {});
  return url;
}

/** POST /api/generate (SSE over fetch): progress lines, then the finished doc. */
async function generate(prompt: string, onProgress: (m: string) => void): Promise<any> {
  const r = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) throw new Error("Generation ended unexpectedly.");
    buf += value;
    for (let i; (i = buf.indexOf("\n\n")) >= 0; buf = buf.slice(i + 2)) {
      const ev = JSON.parse(buf.slice(0, i).replace(/^data: /, ""));
      if (ev.type === "progress") onProgress(ev.message);
      else if (ev.type === "done") return ev.doc;
      else if (ev.type === "error") throw new Error(ev.message);
    }
  }
}

function Library() {
  const [flows, setFlows] = useState<db.LocalFlow[]>([]);
  const [err, setErr] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const refresh = () => db.list().then(setFlows);
  useEffect(() => void refresh(), []);
  const add = async (doc: any) => { location.href = `/local/${await db.save(doc)}`; };
  const onImport = async (f?: File) => {
    if (!f) return;
    try {
      const text = await f.text();
      if (f.name.endsWith(".json")) return await add(JSON.parse(text));
      const { parseDsl } = await import("@flowmotion/core"); // lazy: keeps zod/elk out of the first paint
      const r = parseDsl(text);
      if (!r.doc) return setErr(r.issues.map((i) => `${i.line ? `line ${i.line}: ` : ""}${i.message}`).join("\n"));
      await add(r.doc);
    } catch (e) { setErr(`Not a valid flow file: ${e}`); }
  };
  const onGenerate = async () => {
    setErr(""); setBusy("Starting…");
    try { await add(await generate(prompt, setBusy)); } catch (e) { setErr(String((e as Error).message)); setBusy(""); }
  };
  return (
    <Shell>
      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Generate with AI</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (prompt.trim() && !busy) void onGenerate(); }}>
          <input aria-label="Describe a flow" className="min-w-0 flex-1 rounded-md border border-stone-400 px-3 py-1 text-sm" placeholder="e.g. How a database deadlock forms and is resolved" value={prompt} maxLength={4000} disabled={!!busy} onChange={(e) => setPrompt(e.target.value)} />
          <button className={btn} disabled={!!busy || !prompt.trim()}>Generate</button>
        </form>
        {busy && <p role="status" className="mt-1 text-sm text-stone-500">{busy}</p>}
      </section>
      <section className="mb-8">
        <h2 className="mb-2 font-semibold">My flows</h2>
        {err && <p role="alert" className="whitespace-pre-line text-red-600">{err}</p>}
        {flows.length === 0 && <p className="text-slate-500">Nothing here yet. Start from a template or import a file.</p>}
        <ul className="divide-y rounded border bg-white">
          {flows.map((f) => (
            <li key={f.id} className="flex items-center justify-between p-3">
              <a className={link} href={`/local/${f.id}`}>{f.doc?.meta?.title ?? f.id}</a>
              <a className={`${btn} ml-auto mr-2`} href={`/edit/${f.id}`}>Edit</a>
              <button className={btn} onClick={() => db.remove(f.id).then(refresh)}>Delete</button>
            </li>
          ))}
        </ul>
        <label className={`${btn} mt-3 inline-block cursor-pointer`}>Import .flow / .json
          <input type="file" accept=".flow,.json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
        </label>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Catalog</h2>
        {[...domains].map(([d, ts]) => (
          <div key={d} className="mb-3">
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-stone-500">{domainName(d)}</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {ts.map((t) => (
                <li key={t.slug} className="flex items-center justify-between rounded border bg-white p-3">
                  <a className={link} href={`/t/${d}/${t.slug}`}>{t.title}</a>
                  <button className={btn} onClick={() => tplDoc(t).then(add, (e) => setErr(String(e.message)))}>Use</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </Shell>
  );
}

/** Keeps `?s=&step=` (0-based step) in sync with the player's navigation, so the address bar is always a deep link. */
function useDeepLink() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const on = (e: Event) => { const { scenario, step } = (e as CustomEvent).detail; history.replaceState(null, "", `?s=${encodeURIComponent(scenario)}&step=${step}`); };
    el.addEventListener("flow-step", on);
    return () => el.removeEventListener("flow-step", on);
  }, []);
  return ref;
}

function EmbedDialog({ id, onClose }: { id: string; onClose(): void }) {
  const o = location.origin, q = location.search;
  const snippets = [
    ["iframe", `<iframe src="${o}/embed/${id}${q}" width="100%" height="560" style="border:0" allowfullscreen></iframe>`],
    ["<flow-player>", `<script src="${o}/flow-player.js"></script>\n<flow-player src="${o}/api/share/${id}"${new URLSearchParams(q).get("s") ? ` scenario="${new URLSearchParams(q).get("s")}" step="${new URLSearchParams(q).get("step") ?? 0}"` : ""} style="height:560px"></flow-player>`],
  ] as const;
  return (
    <dialog open aria-label="Embed" className="fixed inset-0 z-10 m-auto w-[36rem] max-w-[95vw] rounded-lg border border-stone-400 p-4 shadow-xl">
      <h2 className="mb-2 font-semibold">Embed this flow</h2>
      {snippets.map(([name, code]) => (
        <div key={name} className="mb-3">
          <div className="mb-1 flex items-center"><span className="mr-auto text-xs font-bold uppercase text-stone-500">{name}</span><button className={btn} onClick={() => void navigator.clipboard?.writeText(code)}>Copy</button></div>
          <textarea readOnly aria-label={`${name} snippet`} className="h-20 w-full rounded border border-stone-300 bg-stone-50 p-2 font-mono text-xs" value={code} onFocus={(e) => e.currentTarget.select()} />
        </div>
      ))}
      <button className={btn} onClick={onClose}>Close</button>
    </dialog>
  );
}

function Viewer({ id }: { id: string }) {
  const q = new URLSearchParams(location.search), ref = useDeepLink();
  const [embed, setEmbed] = useState(false);
  // Remix: copy the snapshot into this browser's library (client-only); the shared one stays untouched.
  const remix = async () => { const r = await fetch(`/api/share/${id}`); location.href = `/local/${await db.save((await r.json()).doc)}`; };
  return (
    <Shell side={false}>
      <div className="flex items-center gap-2">
        <span className="mr-auto text-sm text-stone-500">Shared snapshot. <a className={link} href="/">Make your own</a></span>
        <button className={btn} onClick={() => setEmbed(true)}>Embed</button>
        <button className={btn} onClick={() => void remix()}>Remix</button>
      </div>
      <div className="min-h-0 flex-1"><Player ref={ref} fill src={`/api/share/${id}`} scenario={q.get("s") ?? undefined} step={q.get("step") ?? undefined} /></div>
      {embed && <EmbedDialog id={id} onClose={() => setEmbed(false)} />}
    </Shell>
  );
}

/** Chrome-less player for iframes. */
function Embed({ id }: { id: string }) {
  const q = new URLSearchParams(location.search), ref = useDeepLink();
  return <div className="h-screen"><Player ref={ref} fill src={`/api/share/${id}`} scenario={q.get("s") ?? undefined} step={q.get("step") ?? undefined} /></div>;
}

/** A catalog template: play it in place; "Make a copy" puts an editable one in My flows. */
function Template({ domain, slug }: { domain: string; slug: string }) {
  const t = catalog.find((x) => x.domain === domain && x.slug === slug);
  const [src, setSrc] = useState<string>();
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!t) return;
    void (async () => {
      try {
        const { compile } = await import("@flowmotion/core");
        const r = await compile(await tplDoc(t));
        setSrc(URL.createObjectURL(new Blob([JSON.stringify(r.compiled)], { type: "application/json" })));
      } catch (e) { setErr(String((e as Error).message)); }
    })();
  }, [t]);
  if (!t) return <Shell><p>No such template. <a className={link} href="/">Back</a></p></Shell>;
  return (
    <Shell>
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">{t.title} <span className="text-sm font-normal text-stone-500">{domainName(domain)}</span></h1>
        <a className={btn} href={`/f/${domain}/${slug}`}>Read the lesson</a>
        <button className={btn} onClick={async () => { location.href = `/edit/${await db.save(await tplDoc(t))}`; }}>Make a copy</button>
      </div>
      {err && <p role="alert" className="text-red-600">{err}</p>}
      {src && <div className="min-h-0 flex-1"><Player fill src={src} /></div>}
    </Shell>
  );
}

function Local({ id }: { id: string }) {
  const [flow, setFlow] = useState<db.LocalFlow | null | undefined>();
  const [src, setSrc] = useState<string>();
  const [msg, setMsg] = useState("");
  const [ask, setAsk] = useState<string[]>(), [embed, setEmbed] = useState(false); // share dialog: local icons used by the flow
  useEffect(() => {
    // compile here (not in the player) so `local:` icons from this browser's library are drawn
    void (async () => {
      const f = await db.load(id);
      setFlow(f ?? null);
      if (!f) return;
      await refreshIcons();
      const { compile } = await import("@flowmotion/core");
      const r = await compile(f.doc, { localIcons: getLocalIcons() });
      setSrc(URL.createObjectURL(new Blob([JSON.stringify(r.compiled ?? f.doc)], { type: "application/json" })));
    })();
  }, [id]);
  const doShare = (icons?: Record<string, unknown>) => share(flow!.doc, icons).then((u) => setMsg(`Link copied: ${u}`), (e) => setMsg(`Share failed: ${e.message}`));
  const onShare = () => {
    const have = localRefs(flow!.doc).filter((r) => getLocalIcons()[r]);
    if (have.length) { setAsk(have); setEmbed(false); } else void doShare();
  };
  if (flow === undefined) return <Shell>Loading…</Shell>;
  if (flow === null) return <Shell><p>Flow not found in this browser. <a className={link} href="/">Back</a></p></Shell>;
  return (
    <Shell>
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">{flow.doc.meta?.title}</h1>
        <a className={btn} href={`/edit/${flow.id}`}>Edit</a>
        <button className={btn} onClick={async () => {
          const { printDsl } = await import("@flowmotion/core");
          const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([printDsl(flow.doc)], { type: "text/plain" })), download: `${flow.id}.flow` });
          a.click(); URL.revokeObjectURL(a.href);
        }}>Export .flow</button>
        <button className={btn} onClick={onShare}>Share</button>
      </div>
      {ask && (
        <div role="dialog" aria-label="Share options" className="mb-2 rounded border border-stone-300 bg-white p-3 text-sm">
          <p className="mb-1">This flow uses local icons: <b>{ask.join(", ")}</b>. They live only in this browser; viewers of the link see the default glyph unless you embed them.</p>
          <label className="mb-2 block"><input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} /> Embed these icons in the public snapshot</label>
          <button className={btn} onClick={() => { const icons = embed ? Object.fromEntries(ask.map((r) => [r, getLocalIcons()[r]])) : undefined; setAsk(undefined); void doShare(icons); }}>Share</button>{" "}
          <button className={btn} onClick={() => setAsk(undefined)}>Cancel</button>
        </div>
      )}
      {msg && <p role="status" className="mb-2 text-sm">{msg}</p>}
      {src && <div className="min-h-0 flex-1"><Player fill src={src} /></div>}
    </Shell>
  );
}

export function App() {
  const [, root, id, slug] = location.pathname.split("/");
  switch (root) {
    case "t": return <Template domain={id!} slug={slug!} />;
    case "v": return <Viewer id={id!} />;
    case "embed": return <Embed id={id!} />;
    case "local": return <Local id={id!} />;
    case "edit": return <Suspense fallback={null}><Editor id={id!} /></Suspense>;
    default: return <Library />;
  }
}
