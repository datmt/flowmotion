import { useEffect, useState } from "react";
import * as db from "./db.ts";

const templates = import.meta.glob<any>("../../../templates/*.flow.json", { eager: true, import: "default" });
const Player = "flow-player" as any; // custom element, see packages/player

const link = "text-blue-600 hover:underline";
const btn = "rounded-md border border-stone-400 bg-white px-3 py-1 text-sm hover:border-emerald-600";

function Sidebar() {
  const [flows, setFlows] = useState<db.LocalFlow[]>([]);
  useEffect(() => void db.list().then(setFlows), []);
  const here = location.pathname;
  const item = (active: boolean) => `block truncate rounded-md px-2 py-1.5 text-sm ${active ? "bg-emerald-100 font-semibold text-emerald-900" : "hover:bg-stone-200/60"}`;
  return (
    <nav className="hidden w-64 shrink-0 overflow-auto border-r border-stone-300 bg-stone-100 p-3 md:block">
      <h2 className="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-stone-500">My flows</h2>
      {flows.length === 0 && <p className="px-2 pb-2 text-sm text-stone-400">Nothing yet</p>}
      {flows.map((f) => <a key={f.id} href={`/local/${f.id}`} className={item(here === `/local/${f.id}`)}>{f.doc?.meta?.title ?? f.id}</a>)}
      <h2 className="px-2 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-stone-500">Templates</h2>
      {Object.values(templates).map((t) => <a key={t.meta.title} href="/" className={item(false)}>{t.meta.title}</a>)}
    </nav>
  );
}

function Shell({ children, side = true }: { children: React.ReactNode; side?: boolean }) {
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
async function share(doc: unknown): Promise<string> {
  const r = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc }) });
  const b = await r.json();
  if (!r.ok) throw new Error(b.issues ? b.issues.map((i: any) => i.message).join("\n") : b.message ?? b.error);
  const url = `${location.origin}/v/${b.id}`;
  await navigator.clipboard?.writeText(url).catch(() => {});
  return url;
}

function Library() {
  const [flows, setFlows] = useState<db.LocalFlow[]>([]);
  const [err, setErr] = useState("");
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
  return (
    <Shell>
      <section className="mb-8">
        <h2 className="mb-2 font-semibold">My flows</h2>
        {err && <p role="alert" className="whitespace-pre-line text-red-600">{err}</p>}
        {flows.length === 0 && <p className="text-slate-500">Nothing here yet. Start from a template or import a file.</p>}
        <ul className="divide-y rounded border bg-white">
          {flows.map((f) => (
            <li key={f.id} className="flex items-center justify-between p-3">
              <a className={link} href={`/local/${f.id}`}>{f.doc?.meta?.title ?? f.id}</a>
              <button className={btn} onClick={() => db.remove(f.id).then(refresh)}>Delete</button>
            </li>
          ))}
        </ul>
        <label className={`${btn} mt-3 inline-block cursor-pointer`}>Import .flow / .json
          <input type="file" accept=".flow,.json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
        </label>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Templates</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.values(templates).map((t) => (
            <li key={t.meta.title} className="flex items-center justify-between rounded border bg-white p-3">
              <span>{t.meta.title}</span>
              <button className={btn} onClick={() => add(t)}>Use</button>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}

function Viewer({ id }: { id: string }) {
  const q = new URLSearchParams(location.search);
  return (
    <Shell side={false}>
      <div className="min-h-0 flex-1"><Player fill src={`/api/share/${id}`} scenario={q.get("s") ?? undefined} step={q.get("step") ?? undefined} /></div>
      <p className="text-sm text-stone-500">Shared snapshot. <a className={link} href="/">Make your own</a></p>
    </Shell>
  );
}

function Local({ id }: { id: string }) {
  const [flow, setFlow] = useState<db.LocalFlow | null | undefined>();
  const [src, setSrc] = useState<string>();
  const [msg, setMsg] = useState("");
  useEffect(() => { db.load(id).then((f) => { setFlow(f ?? null); if (f) setSrc(URL.createObjectURL(new Blob([JSON.stringify(f.doc)], { type: "application/json" }))); }); }, [id]);
  if (flow === undefined) return <Shell>Loading…</Shell>;
  if (flow === null) return <Shell><p>Flow not found in this browser. <a className={link} href="/">Back</a></p></Shell>;
  return (
    <Shell>
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">{flow.doc.meta?.title}</h1>
        <button className={btn} onClick={async () => {
          const { printDsl } = await import("@flowmotion/core");
          const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([printDsl(flow.doc)], { type: "text/plain" })), download: `${flow.id}.flow` });
          a.click(); URL.revokeObjectURL(a.href);
        }}>Export .flow</button>
        <button className={btn} onClick={() => share(flow.doc).then((u) => setMsg(`Link copied: ${u}`), (e) => setMsg(`Share failed: ${e.message}`))}>Share</button>
      </div>
      {msg && <p role="status" className="mb-2 text-sm">{msg}</p>}
      {src && <div className="min-h-0 flex-1"><Player fill src={src} /></div>}
    </Shell>
  );
}

export function App() {
  const [, root, id] = location.pathname.split("/");
  switch (root) {
    case "v": return <Viewer id={id!} />;
    case "local": return <Local id={id!} />;
    default: return <Library />;
  }
}
