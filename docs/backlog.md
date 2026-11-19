# Flow backlog

Agent: pick the first unchecked line in a domain, build it per `docs/guide.md` and `CONTRIBUTING.md`, save `templates/<domain>/<slug>.flow`, run `pnpm test`, then tick it here (`[x]`) in the same commit. One flow per commit/PR. Format: `slug: topic (level) - the failure branch to show`.

Regulated domains (banking, insurance, fintech, construction, law): `source` must be primary/authoritative; say the jurisdiction in `summary`. Start with the pilot (first line) to learn what the DSL can't express, and report gaps before building more.

## distributed-systems
- [ ] two-phase-commit: 2PC (intermediate) - coordinator crash after prepare
- [ ] consistent-hashing: ring + node join/leave (intermediate) - hot node
- [ ] leader-lease: lease-based leadership (advanced) - clock skew
- [ ] gossip-protocol: epidemic dissemination (intermediate) - node failure detection
- [ ] outbox-pattern: transactional outbox (intermediate) - relay crash, duplicate publish
- [ ] cqrs-event-sourcing: command/event/projection (intermediate) - projection rebuild
- [ ] rate-limiter-token-bucket: token bucket (beginner) - burst then throttle
- [ ] cache-stampede: thundering herd (intermediate) - request coalescing

## security
- [ ] tls-1-3-handshake: TLS 1.3 (intermediate) - expired/invalid certificate
- [ ] jwt-validation: JWT issue/verify (beginner) - alg=none / expired token
- [ ] oidc-login: OpenID Connect code flow (intermediate) - state mismatch (CSRF)
- [ ] kerberos: ticket flow (advanced) - ticket replay
- [ ] csrf: cross-site request forgery (beginner) - SameSite/token defence
- [ ] mtls: mutual TLS service auth (intermediate) - revoked client cert

## networking
- [ ] dns-resolution: recursive resolution (beginner) - cache poisoning attempt
- [ ] tcp-handshake-teardown: 3-way handshake, FIN (beginner) - lost SYN-ACK
- [ ] http-3-quic: QUIC handshake (advanced) - packet loss without head-of-line blocking
- [ ] nat-traversal: STUN/hole punching (advanced) - symmetric NAT

## databases
- [ ] mvcc-snapshot-isolation: MVCC (advanced) - write skew
- [ ] b-tree-insert: B-tree split (intermediate) - root split
- [ ] write-ahead-log: WAL + crash recovery (intermediate) - crash mid-checkpoint
- [ ] replication-lag: leader/follower read (beginner) - stale read

## algorithms
- [ ] quicksort: partition (beginner) - worst-case pivot
- [ ] dijkstra: shortest path (intermediate) - negative edge
- [ ] hash-table: chaining/probing (beginner) - collision chain, resize
- [ ] merge-sort: divide and merge (beginner) - already sorted input

## devops
- [ ] git-rebase-vs-merge: history (beginner) - conflict resolution
- [ ] kubernetes-rolling-update: deployment (intermediate) - failing readiness probe, rollback
- [ ] ci-cd-pipeline: build/test/deploy (beginner) - failed test gate
- [ ] blue-green-deploy: cutover (intermediate) - rollback

## machine-learning
- [ ] gradient-descent: optimiser (beginner) - learning rate too high
- [ ] attention: self-attention (advanced) - masked/causal
- [ ] rag-pipeline: retrieve then generate (intermediate) - irrelevant retrieval

## banking (pilot)
- [ ] ach-payment: ACH credit/debit lifecycle, US (intermediate) - return (R01 insufficient funds)
- [ ] card-authorization-settlement: auth, clearing, settlement (intermediate) - chargeback
- [ ] swift-cross-border: correspondent banking (advanced) - compliance hold

## fintech (pilot)
- [ ] kyc-onboarding: KYC/AML onboarding (intermediate) - document mismatch, manual review
- [ ] bnpl-checkout: buy now pay later (beginner) - declined, missed instalment

## insurance (pilot)
- [ ] claim-lifecycle: first notice to payout (intermediate) - claim denied, appeal
- [ ] underwriting: quote to bind (intermediate) - referral to underwriter

## construction (pilot)
- [ ] change-order: scope change approval (beginner) - owner rejects
- [ ] permit-to-occupancy: permit, inspections (intermediate) - failed inspection

## law (pilot)
- [ ] civil-case-lifecycle: filing to judgment, US federal (intermediate) - motion to dismiss granted
- [ ] contract-formation: offer, acceptance, consideration (beginner) - counteroffer
