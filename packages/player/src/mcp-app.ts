// MCP App view (ui://flowmotion/player): speaks the MCP Apps JSON-RPC-over-postMessage bridge by hand
// (ui/initialize → ui/notifications/initialized, then ui/notifications/tool-result carries `_meta.compiled`).
import type { CompiledFlow } from "@flowmotion/core/runtime";
import { FlowPlayerElement } from "./element.ts";

const send = (m: object) => parent.postMessage({ jsonrpc: "2.0", ...m }, "*");
let el: FlowPlayerElement | undefined;

function show(r: { _meta?: { compiled?: CompiledFlow; url?: string } }) {
  const { compiled, url } = r._meta ?? {};
  if (!compiled) return;
  el?.remove();
  el = new FlowPlayerElement();
  el.compiled = compiled;
  document.body.append(el);
  const open = document.getElementById("open") as HTMLAnchorElement;
  open.hidden = !url;
  open.onclick = (e) => { e.preventDefault(); send({ id: Date.now(), method: "ui/open-link", params: { url } }); };
  send({ method: "ui/notifications/size-changed", params: { height: 560 } });
}

addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  if (m?.method === "ui/notifications/tool-result") show(m.params);
  else if (m?.id !== undefined && m.method) send({ id: m.id, result: {} }); // ping / teardown
  else if (m?.id === 1) send({ method: "ui/notifications/initialized" });
});
send({ id: 1, method: "ui/initialize", params: { appInfo: { name: "flowmotion-player", version: "0.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" } });
