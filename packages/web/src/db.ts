// Local library: one IndexedDB store of {id, doc, updated}. Flows never leave the browser until shared.
export interface LocalFlow { id: string; doc: any; updated: number; hist?: { undo: any[]; redo: any[] }; versions?: { t: number; label: string; doc: any; prompt?: string }[] }

const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open("flowmotion", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("flows", { keyPath: "id" });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const r = f(db.transaction("flows", mode).objectStore("flows")); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export const list = () => tx<LocalFlow[]>("readonly", (s) => s.getAll()).then((a) => a.sort((x, y) => y.updated - x.updated));
export const load = (id: string) => tx<LocalFlow | undefined>("readonly", (s) => s.get(id));
export const remove = (id: string) => tx("readwrite", (s) => s.delete(id));
export async function save(doc: any, id: string = crypto.randomUUID(), extra: Pick<LocalFlow, "hist" | "versions"> = {}) {
  await tx("readwrite", (s) => s.put({ ...extra, id, doc, updated: Date.now() }));
  return id;
}
