import { useEffect, useState } from "react";
import * as db from "./db.ts";

const templates = import.meta.glob<any>("../../../templates/*.flow.json", { eager: true, import: "default" });
const Player = "flow-player" as any; // custom element, see packages/player

const link = "text-blue-600 hover:underline";
const btn = "rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:border-blue-500";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6"><a href="/" className="text-xl font-bold">Flowmotion</a></header>
      {children}
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
    try { await add(JSON.parse(await f.text())); } catch (e) { setErr(`Not a valid .flow.json: ${e}`); }
  };
  return (
    <Shell>
      <section className="mb-8">
        <h2 className="mb-2 font-semibold">My flows</h2>
        {err && <p role="alert" className="text-red-600">{err}</p>}
        {flows.length === 0 && <p className="text-slate-500">Nothing here yet. Start from a template or import a file.</p>}
        <ul className="divide-y rounded border bg-white">
          {flows.map((f) => (
            <li key={f.id} className="flex items-center justify-between p-3">
              <a className={link} href={`/local/${f.id}`}>{f.doc?.meta?.title ?? f.id}</a>
              <button className={btn} onClick={() => db.remove(f.id).then(refresh)}>Delete</button>
            </li>
          ))}
        </ul>
        <label className={`${btn} mt-3 inline-block cursor-pointer`}>Import .flow.json
          <input type="file" accept=".json,.flow.json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
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
    <Shell>
      <Player src={`/api/share/${id}`} scenario={q.get("s") ?? undefined} step={q.get("step") ?? undefined} />
      <p className="mt-3 text-sm text-slate-500">Shared snapshot. <a className={link} href="/">Make your own</a></p>
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
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{flow.doc.meta?.title}</h1>
        <button className={btn} onClick={() => share(flow.doc).then((u) => setMsg(`Link copied: ${u}`), (e) => setMsg(`Share failed: ${e.message}`))}>Share</button>
      </div>
      {msg && <p role="status" className="mb-2 text-sm">{msg}</p>}
      {src && <Player src={src} />}
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
