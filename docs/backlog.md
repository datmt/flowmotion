# Flow backlog

Single source of truth for what exists and what to build. `[x]` = in `templates/`, `[ ]` = planned. Line format: `slug: topic (level) - failure branch to show`.

Regulated domains (banking, fintech, insurance, construction, law): `source` must be primary or authoritative; name the jurisdiction in `summary`. Pilots first (marked), to find what the DSL cannot express.

## distributed-systems
- [x] circuit-breaker
- [x] raft-consensus
- [x] retry-backoff-dlq
- [x] saga-compensation
- [x] temporal-replay
- [x] two-phase-commit
- [x] three-phase-commit
- [x] paxos
- [x] multi-paxos
- [x] consistent-hashing
- [x] leader-lease
- [x] gossip-protocol
- [x] swim-membership
- [x] outbox-pattern
- [x] inbox-idempotency
- [x] cqrs-event-sourcing
- [x] rate-limiter-token-bucket
- [x] rate-limiter-sliding-window
- [x] cache-stampede
- [x] cache-aside
- [x] write-through-back
- [ ] vector-clocks: causality (advanced) - concurrent writes
- [ ] lamport-clocks: logical time (intermediate) - out-of-order events
- [ ] crdt-counter: G-counter merge (advanced) - partition and merge
- [ ] quorum-reads-writes: R+W>N (intermediate) - stale read when R+W<=N
- [ ] hinted-handoff: Dynamo-style (advanced) - node down then recovery
- [ ] read-repair: anti-entropy (advanced) - divergent replicas
- [ ] merkle-tree-sync: replica diff (advanced) - one divergent leaf
- [ ] bulkhead: isolation pools (intermediate) - one dependency saturates
- [ ] load-balancer-algorithms: RR, least-conn, hash (beginner) - slow backend
- [ ] service-discovery: registry + health (intermediate) - stale instance
- [ ] sidecar-service-mesh: mTLS + routing (intermediate) - retry storm
- [ ] backpressure: bounded queue (intermediate) - producer faster than consumer
- [ ] exactly-once-kafka: idempotent producer + txn (advanced) - broker failover
- [ ] kafka-consumer-groups: partitions, rebalance (intermediate) - consumer crash
- [ ] distributed-lock-redlock: lock with TTL (advanced) - GC pause, fencing token
- [ ] zookeeper-election: ephemeral nodes (advanced) - session expiry
- [ ] hedged-requests: tail latency (intermediate) - duplicate load
- [ ] timeouts-deadline-propagation: deadlines (intermediate) - cascading timeout
- [ ] strangler-fig: incremental migration (beginner) - rollback route
- [ ] sharding-resharding: range/hash shards (intermediate) - hot shard split
- [ ] ha-failover-split-brain: failover (advanced) - split brain, fencing
- [ ] leader-election-bully: bully algorithm (intermediate) - coordinator crash
- [ ] snapshot-chandy-lamport: global snapshot (advanced) - in-flight messages
- [ ] raft-membership-change: joint consensus (advanced) - removal of leader

## security
- [x] oauth-pkce
- [ ] oauth-client-credentials: machine-to-machine (beginner) - leaked secret rotation
- [ ] oauth-device-flow: device code (intermediate) - code expiry
- [ ] oidc-login: OpenID Connect code flow (intermediate) - state mismatch (CSRF)
- [ ] saml-sso: SP-initiated SSO (intermediate) - assertion replay
- [ ] jwt-validation: issue, verify (beginner) - alg=none, expired token
- [ ] refresh-token-rotation: rotation + reuse detection (intermediate) - stolen refresh token
- [ ] tls-1-3-handshake: TLS 1.3 (intermediate) - invalid certificate
- [ ] mtls: mutual TLS service auth (intermediate) - revoked client cert
- [ ] certificate-chain-validation: chain of trust (intermediate) - unknown issuer
- [ ] acme-lets-encrypt: certificate issuance (intermediate) - failed challenge
- [ ] kerberos: ticket flow (advanced) - ticket replay
- [ ] csrf: cross-site request forgery (beginner) - SameSite and token defence
- [ ] xss-stored-reflected: XSS (beginner) - CSP blocks injection
- [ ] sql-injection: injection (beginner) - parameterised query
- [ ] cors-preflight: CORS (beginner) - blocked origin
- [ ] session-vs-token-auth: cookies vs bearer (beginner) - session fixation
- [ ] webauthn-passkeys: passkey registration/login (intermediate) - phishing resistance
- [ ] totp-2fa: time-based OTP (beginner) - clock drift
- [ ] password-hashing: salt + bcrypt/argon2 (beginner) - leaked database
- [ ] diffie-hellman: key exchange (intermediate) - man in the middle
- [ ] envelope-encryption-kms: DEK/KEK (intermediate) - key rotation
- [ ] secrets-management-vault: dynamic secrets (intermediate) - lease expiry
- [ ] zero-trust-access: identity-aware proxy (intermediate) - device posture fail
- [ ] rbac-vs-abac: authorization models (beginner) - privilege escalation
- [ ] jwks-key-rotation: signing keys (intermediate) - cached old key
- [ ] ssrf: server-side request forgery (intermediate) - metadata endpoint blocked
- [ ] supply-chain-sbom-signing: signed artifacts (intermediate) - tampered dependency
- [ ] waf-request-filtering: WAF (beginner) - false positive
- [ ] ddos-mitigation: scrubbing/rate limit (intermediate) - volumetric spike
- [ ] api-key-hmac-signing: signed requests (intermediate) - replay window

## networking
- [ ] dns-resolution: recursive resolution (beginner) - cache poisoning attempt
- [ ] dnssec: chain of trust (advanced) - forged answer
- [ ] tcp-handshake-teardown: 3-way, FIN (beginner) - lost SYN-ACK
- [ ] tcp-congestion-control: slow start, AIMD (intermediate) - packet loss
- [ ] http-1-1-vs-2-vs-3: multiplexing (intermediate) - head-of-line blocking
- [ ] http-3-quic: QUIC handshake (advanced) - packet loss
- [ ] tls-over-tcp-request: full request path (beginner) - handshake failure
- [ ] nat-traversal: STUN/hole punching (advanced) - symmetric NAT
- [ ] dhcp-lease: DORA (beginner) - rogue DHCP
- [ ] arp-resolution: ARP (beginner) - ARP spoofing
- [ ] bgp-route-propagation: BGP (advanced) - route leak
- [ ] cdn-cache-flow: edge cache (beginner) - cache miss, origin shield
- [ ] load-balancer-l4-l7: L4 vs L7 (intermediate) - health check failure
- [ ] websocket-upgrade: WS handshake (beginner) - reconnect
- [ ] sse-vs-websocket-polling: push models (beginner) - dropped connection
- [ ] grpc-streaming: gRPC call types (intermediate) - deadline exceeded
- [ ] vpn-wireguard: tunnel handshake (intermediate) - key mismatch
- [ ] anycast-routing: anycast (advanced) - node withdrawal
- [ ] ipv6-slaac: address autoconfig (intermediate) - duplicate address
- [ ] smtp-email-delivery: SMTP, SPF/DKIM/DMARC (intermediate) - spoofed sender

## databases
- [x] database-deadlock
- [ ] mvcc-snapshot-isolation: MVCC (advanced) - write skew
- [ ] isolation-anomalies: dirty/non-repeatable/phantom (intermediate) - phantom read
- [ ] b-tree-insert: B-tree split (intermediate) - root split
- [ ] lsm-tree-compaction: memtable, SSTables (advanced) - write stall
- [ ] write-ahead-log: WAL, crash recovery (intermediate) - crash mid-checkpoint
- [ ] replication-lag: leader/follower (beginner) - stale read
- [ ] query-planner-index-choice: plan selection (intermediate) - bad statistics
- [ ] hash-join-vs-nested-loop: join algorithms (intermediate) - spill to disk
- [ ] connection-pooling: pool (beginner) - pool exhaustion
- [ ] optimistic-locking: version column (beginner) - lost update prevented
- [ ] two-phase-locking: 2PL (advanced) - deadlock
- [ ] sharded-transaction-xa: XA (advanced) - in-doubt transaction
- [ ] change-data-capture: CDC via log (intermediate) - consumer lag
- [ ] cache-invalidation-db: cache + DB (intermediate) - race on update
- [ ] bloom-filter: membership (beginner) - false positive
- [ ] vacuum-bloat-postgres: MVCC cleanup (advanced) - long transaction blocks vacuum
- [ ] online-schema-migration: expand/contract (intermediate) - rollback
- [ ] backup-pitr: point-in-time recovery (intermediate) - corrupt WAL segment
- [ ] full-text-search-inverted-index: inverted index (intermediate) - stale index
- [ ] time-series-downsampling: retention (beginner) - late data

## algorithms
- [x] binary-search
- [ ] quicksort: partition (beginner) - worst-case pivot
- [ ] merge-sort: divide, merge (beginner) - already-sorted input
- [ ] heap-sort: heapify (intermediate) - degenerate heap
- [ ] dijkstra: shortest path (intermediate) - negative edge
- [ ] bellman-ford: relaxations (intermediate) - negative cycle
- [ ] a-star: heuristic search (intermediate) - inadmissible heuristic
- [ ] bfs-dfs: graph traversal (beginner) - cycle handling
- [ ] topological-sort: Kahn (intermediate) - cycle detected
- [ ] union-find: disjoint sets (intermediate) - path compression
- [ ] kruskal-prim: MST (intermediate) - tie weights
- [ ] dynamic-programming-knapsack: 0/1 knapsack (intermediate) - greedy fails
- [ ] edit-distance: Levenshtein (intermediate) - substitution vs insert
- [ ] longest-common-subsequence: LCS (intermediate) - tie paths
- [ ] kmp-string-search: KMP (advanced) - failure function
- [ ] two-pointers-sliding-window: patterns (beginner) - shrink condition
- [ ] backtracking-n-queens: n-queens (intermediate) - dead end backtrack
- [ ] quickselect: kth element (intermediate) - bad pivot
- [ ] reservoir-sampling: stream sampling (intermediate) - uneven probability bug
- [ ] fisher-yates-shuffle: shuffle (beginner) - biased naive shuffle
- [ ] trie-autocomplete: trie (beginner) - prefix collision
- [ ] lru-cache: hash + list (beginner) - eviction order
- [ ] hash-table: chaining, probing (beginner) - collision chain, resize
- [ ] sieve-of-eratosthenes: primes (beginner) - off-by-one marking
- [ ] gcd-euclid: Euclid (beginner) - zero input

## data-structures
- [ ] linked-list-reverse: reversal (beginner) - lost pointer
- [ ] stack-queue-deque: basics (beginner) - underflow
- [ ] binary-search-tree-insert-delete: BST (beginner) - delete node with two children
- [ ] avl-rotations: self-balancing (intermediate) - double rotation
- [ ] red-black-tree-insert: RB (advanced) - recolour vs rotate
- [ ] min-heap-priority-queue: heap (beginner) - sift down
- [ ] skip-list: probabilistic list (intermediate) - level promotion
- [ ] segment-tree: range queries (advanced) - lazy propagation
- [ ] ring-buffer: circular buffer (beginner) - overwrite on full
- [ ] bitmap-roaring: compressed bitmaps (advanced) - container switch

## operating-systems
- [ ] process-scheduling-rr-cfs: schedulers (intermediate) - starvation
- [ ] virtual-memory-paging: page table, TLB (intermediate) - page fault
- [ ] page-replacement-lru-clock: replacement (intermediate) - thrashing
- [ ] mutex-semaphore-condvar: sync primitives (intermediate) - lost wakeup
- [ ] deadlock-banker: Banker's algorithm (advanced) - unsafe state
- [ ] syscall-context-switch: user/kernel (beginner) - blocking I/O
- [ ] epoll-event-loop: async I/O (intermediate) - slow handler blocks loop
- [ ] fork-exec-pipe: shell pipeline (beginner) - SIGPIPE
- [ ] filesystem-journaling: ext4 journal (advanced) - crash mid-write
- [ ] oom-killer: memory pressure (intermediate) - victim selection
- [ ] container-namespaces-cgroups: isolation (intermediate) - memory limit kill
- [ ] garbage-collection-generational: GC (intermediate) - promotion, stop-the-world

## web
- [ ] browser-page-load: URL to render (beginner) - blocking script
- [ ] critical-rendering-path: DOM/CSSOM/layout (intermediate) - layout thrash
- [ ] http-caching-etag: validation (beginner) - stale-while-revalidate
- [ ] service-worker-lifecycle: SW (intermediate) - stale worker
- [ ] react-reconciliation: virtual DOM (intermediate) - key misuse
- [ ] ssr-hydration: SSR (intermediate) - hydration mismatch
- [ ] graphql-resolver-n-plus-one: resolvers (intermediate) - dataloader batching
- [ ] rest-idempotency-keys: retries (beginner) - duplicate charge prevented
- [ ] webhook-delivery-retries: webhooks (beginner) - signature, retry
- [ ] file-upload-presigned-url: direct upload (beginner) - expired URL
- [ ] event-loop-js: call stack, microtasks (beginner) - blocking task
- [ ] cookie-lifecycle: cookies (beginner) - SameSite lax block

## devops
- [ ] git-rebase-vs-merge: history (beginner) - conflict resolution
- [ ] git-bisect: bug hunt (beginner) - skipped commit
- [ ] ci-cd-pipeline: build, test, deploy (beginner) - failed test gate
- [ ] blue-green-deploy: cutover (intermediate) - rollback
- [ ] canary-release: progressive delivery (intermediate) - metric regression
- [ ] feature-flags: flag evaluation (beginner) - kill switch
- [ ] kubernetes-rolling-update: deployment (intermediate) - failing readiness probe
- [ ] kubernetes-pod-scheduling: scheduler (intermediate) - unschedulable pod
- [ ] kubernetes-hpa-autoscaling: HPA (intermediate) - flapping
- [ ] kubernetes-service-ingress: traffic path (intermediate) - no endpoints
- [ ] gitops-argo-sync: GitOps (intermediate) - drift detection
- [ ] terraform-plan-apply: IaC (beginner) - state lock conflict
- [ ] docker-image-layers: build cache (beginner) - cache bust
- [ ] observability-trace-propagation: distributed tracing (intermediate) - missing context
- [ ] slo-error-budget: SLO policy (intermediate) - budget exhausted
- [ ] incident-response: on-call lifecycle (beginner) - escalation
- [ ] secrets-in-ci: CI secrets (beginner) - leaked in logs
- [ ] monorepo-affected-build: build graph (intermediate) - cache poisoning

## cloud
- [ ] serverless-cold-start: Lambda lifecycle (beginner) - cold start spike
- [ ] s3-multipart-upload: multipart (beginner) - abort, orphaned parts
- [ ] iam-policy-evaluation: allow/deny (intermediate) - explicit deny wins
- [ ] vpc-routing-nat: VPC (intermediate) - missing route
- [ ] autoscaling-group: scale out/in (beginner) - scale-in kills busy node
- [ ] queue-sqs-visibility-timeout: SQS (beginner) - visibility expiry, duplicate
- [ ] multi-region-failover: DR (advanced) - failback data loss
- [ ] cdn-signed-urls: private content (beginner) - expired signature

## machine-learning
- [x] backprop
- [ ] gradient-descent: optimiser (beginner) - learning rate too high
- [ ] sgd-momentum-adam: optimisers (intermediate) - oscillation
- [ ] overfitting-regularisation: train vs val (beginner) - overfit
- [ ] attention: self-attention (advanced) - causal mask
- [ ] transformer-block: layer flow (advanced) - residual removed
- [ ] tokenization-bpe: BPE merges (intermediate) - unknown word
- [ ] rag-pipeline: retrieve then generate (intermediate) - irrelevant retrieval
- [ ] kv-cache-inference: autoregressive decoding (advanced) - cache eviction
- [ ] cnn-convolution: convolution, pooling (beginner) - stride/padding error
- [ ] k-means: clustering (beginner) - bad initial centroids
- [ ] decision-tree-split: Gini (beginner) - overfit depth
- [ ] train-test-leakage: data leakage (intermediate) - leaked feature
- [ ] rlhf-pipeline: preference training (advanced) - reward hacking
- [ ] agent-tool-loop: LLM tool calling (intermediate) - tool error recovery
- [ ] feature-store-online-offline: serving (advanced) - training/serving skew

## banking
- [ ] ach-payment: ACH lifecycle, US (intermediate) - return R01 insufficient funds  **pilot**
- [ ] card-authorization-settlement: auth, clearing, settlement (intermediate) - chargeback  **pilot**
- [ ] swift-cross-border: correspondent banking (advanced) - compliance hold  **pilot**
- [ ] wire-transfer-fedwire: wire (intermediate) - recall request
- [ ] sepa-credit-transfer: SEPA (intermediate) - rejected IBAN
- [ ] sepa-direct-debit: mandate and collection (intermediate) - R-transaction refund
- [ ] check-clearing-image-exchange: Check 21 (intermediate) - bounced check
- [ ] loan-origination: application to funding (intermediate) - declined, adverse action
- [ ] mortgage-closing: underwriting to close (advanced) - appraisal gap
- [ ] credit-card-dispute: dispute lifecycle (intermediate) - representment
- [ ] overdraft-handling: NSF processing (beginner) - fee vs decline
- [ ] account-opening-cip: CIP (beginner) - failed identity check
- [ ] aml-transaction-monitoring: alert to SAR (advanced) - false positive closure
- [ ] interbank-settlement-rtgs: RTGS (advanced) - liquidity shortage
- [ ] fx-trade-settlement: FX spot (intermediate) - settlement risk
- [ ] atm-withdrawal: ATM auth (beginner) - timeout reversal
- [ ] reconciliation-ledger: daily recon (intermediate) - break investigation
- [ ] open-banking-consent: PSD2/AIS (intermediate) - consent revoked

## fintech
- [ ] kyc-onboarding: KYC/AML (intermediate) - document mismatch, manual review  **pilot**
- [ ] bnpl-checkout: buy now pay later (beginner) - decline, missed instalment  **pilot**
- [ ] payment-gateway-flow: merchant to acquirer (beginner) - 3DS challenge failure
- [ ] 3d-secure-authentication: 3DS2 (intermediate) - frictionless vs challenge
- [ ] stripe-style-payment-intent: intent lifecycle (beginner) - requires_action, webhook race
- [ ] marketplace-split-payments: payouts (intermediate) - refund after payout
- [ ] recurring-billing-dunning: subscriptions (intermediate) - failed renewal retries
- [ ] double-entry-ledger: posting (beginner) - unbalanced entry rejected
- [ ] p2p-transfer: wallet to wallet (beginner) - insufficient funds, idempotent retry
- [ ] crypto-exchange-order-matching: order book (intermediate) - partial fill
- [ ] stablecoin-mint-redeem: mint/redeem (intermediate) - redemption surge
- [ ] fraud-scoring-decision: real-time score (intermediate) - false positive review
- [ ] chargeback-lifecycle-merchant: merchant side (intermediate) - evidence rebuttal
- [ ] instant-payments-fednow-rtp: instant rail (intermediate) - timeout and status inquiry
- [ ] robo-advisor-rebalance: rebalance (beginner) - drift threshold
- [ ] lending-marketplace-p2p: P2P lending (intermediate) - borrower default
- [ ] payout-to-bank-account: payout (beginner) - returned payout
- [ ] tokenization-card-vault: PCI tokens (intermediate) - detokenization request denied

## insurance
- [ ] claim-lifecycle: first notice to payout (intermediate) - denied, appeal  **pilot**
- [ ] underwriting: quote to bind (intermediate) - referral to underwriter  **pilot**
- [ ] policy-lifecycle: issue, renew, cancel (beginner) - lapse for non-payment
- [ ] auto-claim-total-loss: total loss (intermediate) - salvage dispute
- [ ] health-claim-adjudication: adjudication (advanced) - prior auth denial
- [ ] life-insurance-underwriting: medical underwriting (intermediate) - rated up
- [ ] reinsurance-treaty-cession: cession (advanced) - large-loss recovery
- [ ] subrogation: recovery (intermediate) - fault split
- [ ] fnol-fraud-triage: fraud flag (intermediate) - SIU referral
- [ ] premium-billing-grace-period: grace period (beginner) - reinstatement
- [ ] catastrophe-claims-surge: cat event (advanced) - adjuster capacity shortage
- [ ] parametric-insurance-payout: trigger-based (intermediate) - basis risk
- [ ] broker-quote-comparison: placement (beginner) - carrier declines

## construction
- [ ] change-order: scope change approval (beginner) - owner rejects  **pilot**
- [ ] permit-to-occupancy: permits, inspections (intermediate) - failed inspection  **pilot**
- [ ] rfi-submittal: RFI/submittal review (beginner) - rejected submittal
- [ ] bid-to-award: tender (beginner) - bid protest
- [ ] progress-payment-application: pay app (intermediate) - retainage dispute
- [ ] lien-waiver-flow: lien rights (intermediate) - unpaid subcontractor lien
- [ ] design-build-vs-design-bid-build: delivery methods (intermediate) - design error liability
- [ ] critical-path-scheduling: CPM (intermediate) - delay on critical path
- [ ] site-safety-incident: incident (beginner) - stop-work order
- [ ] commissioning-handover: closeout (intermediate) - punch list
- [ ] material-procurement-lead-time: procurement (beginner) - supply delay
- [ ] bim-clash-detection: BIM coordination (intermediate) - unresolved clash
- [ ] warranty-claim-defect: defects (beginner) - claim denied

## law
- [ ] civil-case-lifecycle: filing to judgment, US federal (intermediate) - motion to dismiss granted  **pilot**
- [ ] contract-formation: offer, acceptance, consideration (beginner) - counteroffer  **pilot**
- [ ] criminal-procedure-us: arrest to trial (intermediate) - suppressed evidence
- [ ] discovery-process: civil discovery (intermediate) - motion to compel
- [ ] appeal-process: appellate path (intermediate) - reversed and remanded
- [ ] small-claims: simplified procedure (beginner) - default judgment
- [ ] contract-breach-remedies: remedies (intermediate) - mitigation failure
- [ ] trademark-registration-us: USPTO (intermediate) - office action refusal
- [ ] patent-prosecution: filing to grant (advanced) - rejection and amendment
- [ ] copyright-dmca-takedown: DMCA (beginner) - counter-notice
- [ ] gdpr-data-subject-request: DSAR (intermediate) - identity verification failure
- [ ] probate-process: estate (intermediate) - contested will
- [ ] incorporation-delaware: formation (beginner) - name unavailable
- [ ] merger-due-diligence: M&A (advanced) - deal-breaking finding
- [ ] arbitration-vs-litigation: ADR (beginner) - award challenge
- [ ] employment-termination: wrongful termination (intermediate) - retaliation claim
- [ ] eviction-process: landlord-tenant, US (intermediate) - tenant cures default
