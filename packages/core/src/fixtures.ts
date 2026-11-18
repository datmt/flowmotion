// PRD §3.6 examples
export const saga = {
  version: "2.1",
  meta: { title: "Saga: order checkout" },
  groups: [{ id: "services", label: "Services" }],
  nodes: [
    { id: "client", label: "Client", kind: "actor" },
    { id: "orch", label: "Order Saga", kind: "service" },
    { id: "payment", label: "Payment", kind: "service", group: "services" },
  ],
  edges: [{ from: "client", to: "orch" }, { from: "orch", to: "payment" }],
  scenarios: [
    { id: "happy", title: "Happy path", steps: [
      { id: "checkout", title: "Checkout", narration: "The client places an order.",
        actions: [{ do: "send", from: "client", to: "orch", label: "PlaceOrder" }, { do: "state", targets: ["orch"], state: "active" }] },
    ] },
    { id: "fail", title: "What if?", branchFrom: { scenario: "happy", afterStep: "checkout" }, steps: [
      { id: "boom", title: "Boom", narration: "It fails.",
        actions: [{ do: "callout", target: "payment", text: "x", start: "with" }] },
    ] },
  ],
};
export const bsearch = {
  version: "2.1",
  meta: { title: "Binary search for 23" },
  nodes: [], edges: [],
  arrays: [
    { id: "nums", values: ["2", "5", "8", "12", "16", "23"] },
    { id: "vars", label: "Variables", keys: ["lo", "mid", "hi"], values: ["0", "4", "9"] },
  ],
  code: [{ id: "c", language: "ts", code: "a\nb\nc\nd\ne\nf\ng\nh\ni" }],
  tokens: [{ id: "lo", label: "lo", at: "nums#0" }],
  scenarios: [{ id: "main", title: "Find 23", steps: [
    { id: "p1", title: "Probe", narration: "mid = 4.", actions: [
      { do: "pulse", targets: ["nums#4"] },
      { do: "state", targets: ["nums#0..4"], state: "disabled" },
      { do: "move", token: "lo", to: "nums#5" },
      { do: "label", target: "vars#lo", text: "5", start: "with" },
      { do: "highlight", target: "c", lines: "3-5,9" },
    ] },
  ] }],
};

