# FlowMotion text DSL — draft & F35 spike results

Compiles to FlowDoc (schema 2.1). Line-oriented, 2-space indentation, one action per line.

## Grammar sketch

```
file      := "flow" STR NL ["summary" STR NL] decl* scenario+
decl      := group | node | edge | array | grid | token | code        # same fields as FlowDoc, positional + flags
group     := "group" ID STR
node      := "node" ID STR KIND ["in" ID] ["hidden"]
edge      := "edge" ID ">" ID [STR] ["hidden"] ["dashed"]
scenario  := "scenario" ID STR ["from" ID "/" ID] NL step+          # from <scenario>/<afterStep>
step      := INDENT "step" ID STR NL INDENT2 STR NL action*         # STR line = narration
action    := send | state | show | hide | label | pulse | effect | focus | callout | move | swap | values | highlight
send      := "send" ID ">" ID [STR] ["via" ID] ["token" ID] timing*
state     := "state" ID{,ID} STATE            show/hide/pulse := verb ID{,ID}
callout   := "callout" REF STR                label := "label" REF STR
move      := "move" ID "to" REF               swap := "swap" REF REF
timing    := "with" | "delay=" N | "dur=" N | "ease=" EASE
```
Strings are double-quoted; cell values are always strings; `#` starts a comment line.

## Final syntax (F36, `packages/core/src/dsl.ts`)

Differs from the sketch above only in uniformity: every option is `key=value` or a bare flag
(`in=services`, `from=happy/charge`, `at=nums#0`, `keys=lo,mid,hi`, `hidden`, `dashed`, `noarrow`).
Arrays/`values` put cell values after a bare `=`; grids use indented `row` / `rowlabels` / `collabels`
lines; code blocks use indented `| text` lines. The spike samples below use the earlier draft syntax
(`in services`); token counts are unaffected.

## Spike: hand-translated flows

Optimistic-lock flow does not exist in `templates/`; `oauth-pkce` (also two scenarios, a hidden
entity and a branch) was used instead. Counts: token-counter MCP (local cl100k approximation) on
compact (minified) JSON vs the draft DSL.

| Flow | JSON tokens | DSL tokens | Saving |
|---|---|---|---|
| saga-compensation | 554 | 327 | 41.0 % |
| oauth-pkce | 788 | 498 | 36.8 % |
| **total** | **1342** | **825** | **38.5 %** |

Bytes: saga 2201 → 1421 (compact JSON; the stored template is 4188 pretty-printed), oauth 3044 → 2101.

## Reading

* **Gate (≥ 40 %): not met** — 38.5 % combined, 1.5 points short, on the *most JSON-friendly* baseline
  (minified; agents emitting indented JSON pay more). Narration prose is identical in both forms and
  is roughly half of every flow, which caps the achievable saving.
* Structure-only (excluding narration/labels) the DSL is about 2–3× smaller; the ceiling is narration.
* Other DSL gains not measured by tokens: no brace/quote/comma errors, line-numbered errors (F36).

## Samples

### saga-compensation
```
flow "Saga: order checkout"
summary "How an orchestrated saga commits, and how it compensates when a step fails."

group services "Services"
node client "Client" actor
node orch "Order Saga" service
node payment "Payment" service in services
node inventory "Inventory" service in services
edge client > orch
edge orch > payment
edge orch > inventory

scenario happy "Happy path"
  step checkout "Checkout"
    "The client places an order. The saga orchestrator now owns the transaction."
    send client > orch "PlaceOrder"
    state orch active
  step charge "Charge card"
    "Step 1: charge the card. This is a local transaction in Payment."
    send orch > payment "Charge"
    state payment success
  step reserve "Reserve stock"
    "Step 2: reserve stock. Both steps committed, so the saga completes."
    send orch > inventory "Reserve"
    state inventory,orch success

scenario inventory-fails "What if inventory fails?" from happy/charge
  step reserve-fails "Reservation fails"
    "Inventory is out of stock and rejects the reservation."
    send orch > inventory "Reserve"
    state inventory error
    send inventory > orch "OutOfStock"
  step refund "Compensate"
    "There is no distributed rollback. The saga runs **compensations** in reverse order: refund the charge."
    send orch > payment "Refund"
    state payment warning
    callout payment "Compensation is a new transaction, not an undo" with
```

### oauth-pkce
```
flow "OAuth 2.0 authorization code + PKCE"
summary "How PKCE protects the authorization code for public clients."

group idp "Identity provider"
node user "User" actor
node app "Client App" service
node authz "Authorization Server" service in idp
node api "Resource API" service
node attacker "Attacker" external hidden
edge user > app
edge app > authz
edge app > api
edge attacker > authz hidden dashed

scenario flow "Happy path"
  step verifier "Create verifier + challenge"
    "The app generates a random `code_verifier` and sends only its hash, the `code_challenge`, with the authorization request."
    send user > app "Log in"
    callout app "challenge = SHA256(verifier)"
  step authorize "Authorize"
    "The user is redirected to the authorization server, signs in and consents. The server stores the challenge."
    send app > authz "/authorize + challenge"
    state authz active
  step code "Receive code"
    "The server redirects back with a short-lived **authorization code**. On its own the code is not enough to get tokens."
    send authz > app "code"
  step exchange "Exchange code + verifier"
    "The app proves it started the flow by sending the original `code_verifier`. The server hashes it and compares it to the stored challenge."
    send app > authz "code + verifier"
    state authz success
    send authz > app "access token"
  step call-api "Call the API"
    "With the access token the app calls the resource API on the user's behalf."
    send app > api "Bearer token"
    state api success

scenario stolen-code "What if the code is stolen?" from flow/code
  step attacker-code "Attacker has the code"
    "Suppose a malicious app on the device intercepted the redirect and holds the authorization code."
    show attacker,attacker-authz
    callout attacker "Has the code, not the verifier"
  step rejected "Exchange rejected"
    "The attacker cannot produce the `code_verifier`, which never left the real app. The hash check fails and no token is issued."
    send attacker > authz "code + guess"
    state authz error
    send authz > attacker "invalid_grant"
```
