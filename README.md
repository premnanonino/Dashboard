# Telnyx Carrier & Billing Monitor — Full Architecture Documentation

A full-stack **Telnyx Carrier Telemetry & FinOps Billing Monitor** featuring an interactive **3D WebGL Spatial Topology Entry Page** (`Three.js`), a **non-AI Swiss-grid Carrier & Billing Operations Dashboard** (`React 19` + `Tailwind CSS v4` + `Motion`), and a **System Design & Data Structures / Algorithms (DSA) Backend Engine** (`Express` + `TypeScript`).

---

## 1. Design & Visual Principles

1. **Zero-Gradient Flat Color Architecture**:
   - Strictly **0 CSS `linear-gradient` / `radial-gradient` / `conic-gradient` or SVG gradient definitions** across the entire application.
   - **60% Dominant Neutral Canvas**: Crisp Architectural Paper (`#F6F7F8`) and Pure White (`#FFFFFF`) on the operations workspace; Deep Obsidian Slate (`#0B111E`) on the 3D spatial viewport.
   - **30% Structural Surfaces**: Cool Slate (`#ECEFF2`), `1px solid #DCE1E7` hairline borders, single-level card depth, and `tabular-nums` (`JetBrains Mono`) alignment on all financial figures, timestamps, and SIP metrics.
   - **10% High-Intent Accent Budget**: Telnyx Carrier Emerald (`#00875A`) and Signal Cobalt (`#1D4ED8`), paired with explicit semantic text states (`Nominal`, `Warning`, `Critical`).
2. **Non-AI Operations Aesthetic**:
   - Engineered as an authentic telecom NOC & FinOps workstation—no chatbots, no sparkle badges, no glowing neon blobs, and no nested card sandwiches.
3. **3D Spatial Entry -> Multi-Stage Loader -> Dashboard**:
   - **3D Entry Viewport (`src/components/Carrier3DLanding.tsx`)**: Multi-part procedural Three.js `THREE.Group` Optical Core Switch + 6 Regional Telnyx PoP Towers (`IAD1`, `ORD1`, `SJC1`, `FRA1`, `LHR1`, `NRT1`) linked by `TubeGeometry` optical fiber conduits and `InstancedMesh` packet pulses, with raycasted PoP inspection, camera presets, and a collapsible bottom control dock.
   - **`Click here` Transition Flow (`src/components/TransitionLoader.tsx`)**: Clicking **`Click here`** triggers a 4-stage animated reticle & solid progress bar loader while hydrating the dashboard snapshot from the backend.

---

## 2. End-to-End System Architecture

```
+-----------------------------------------------------------------------------------+
|                            CLIENT LAYER (React 19 + Vite)                         |
|                                                                                   |
|  [1] Carrier3DLanding (Three.js WebGL + OrbitControls + Layer-1 Raycasting)       |
|         |                                                                         |
|         +---> Click "Click here" ---> [2] TransitionLoader (4-Step Boot Sequence) |
|                                                |                                  |
|                                                v                                  |
|  [3] DashboardWorkspace (Motion Transitions + Skeleton Loaders + EventSource SSE) |
|       ├── BillingFinOpsView   (Balance, Auto-Recharge, Fenwick Range, Invoices)   |
|       ├── SipTrunksView       (Min-Heap Top-4 Trunks, PoP Failover, Trunk Grid)   |
|       ├── DidInventoryView    (Prefix Trie O(L) Search & Longest Prefix Match)    |
|       ├── CdrStreamView       (Live RingBuffer CDR / MDR / Billing Event Stream)  |
|       └── SystemArchitectureView (Live System Design & DSA Complexity Inspector)  |
+-----------------------------------------------------------------------------------+
                                   | HTTP REST (/api/v1/*) & SSE (/api/v1/stream)
                                   v
+-----------------------------------------------------------------------------------+
|                        BACKEND API GATEWAY (Express / server.ts)                  |
|                                                                                   |
|  [Middleware] TokenBucketRateLimiter (O(1) per-IP token refill & burst guard)     |
|       |                                                                           |
|       v                                                                           |
|  [Controller] TelnyxCoreEngine (server/services/telnyxCoreEngine.ts)              |
|       ├── LruCache<DashboardSnapshot> (Doubly-Linked List + HashMap, O(1) TTL)    |
|       ├── CircuitBreaker (CLOSED -> OPEN -> HALF_OPEN)                            |
|       │     ├── Live Mode: HTTPS fetch -> https://api.telnyx.com/v2/balance       |
|       │     └── Fallback/Sandbox Mode: Deterministic Carrier Telemetry Engine     |
|       ├── ConsistentHashRing (FNV-1a 32-bit + 120 vnodes/PoP + Binary Search)     |
|       └── EventBus (Decoupled Pub/Sub -> Server-Sent Events /api/v1/stream)       |
|                                                                                   |
|  [In-Memory DSA Indexing Layer (server/dsa/*)]                                    |
|       ├── PrefixTrie<DidPhoneNumber> & Rate-Deck Longest Prefix Match (LPM)       |
|       ├── FenwickTree (24-bucket Binary Indexed Tree for O(log N) spend sums)     |
|       ├── MinHeap<SipTrunkConnection> (O(N log K) Top-K costliest trunks)         |
|       ├── RingBuffer<DetailRecordEvent> (O(1) fixed-memory 256-slot CDR buffer)   |
|       └── SlidingWindowSpendTracker (O(1) amortized 300s burn velocity detector)  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Backend System Design Patterns (`server/system/`)

| Component | File | Design Pattern & Responsibility | Complexity |
| :--- | :--- | :--- | :--- |
| **Token Bucket Rate Limiter** | `server/system/rateLimiter.ts` | Per-client token bucket (`capacity = 180`, `refill = 40 tokens/sec`) emitting `X-RateLimit-*` headers and `429` backpressure on burst exhaustion. | `O(1)` time & space per client |
| **3-State Circuit Breaker** | `server/system/circuitBreaker.ts` | Protects upstream `https://api.telnyx.com/v2` calls (`CLOSED` -> `OPEN` after 3 failures -> `HALF_OPEN` after 15s cooldown -> `CLOSED` after 2 probes). | `O(1)` state transition |
| **LRU Cache with TTL** | `server/system/lruCache.ts` | Custom **Doubly-Linked List + HashMap** cache with per-entry TTL expiration and write-through invalidation on billing mutations. | `O(1)` `get`, `put`, and eviction |
| **Consistent Hash Ring** | `server/system/consistentHash.ts` | FNV-1a 32-bit hashing with **120 virtual nodes per PoP** and binary search lookup. Automatically rebalances trunks/DIDs when a PoP enters `Failover`. | `O(log V)` lookup, `O(P·V log(P·V))` rebuild |
| **Pub/Sub Event Bus** | `server/system/eventBus.ts` | Observer pattern decoupling the 3.5s carrier telemetry loop and billing mutations from connected `/api/v1/stream` SSE HTTP responses. | `O(S)` broadcast for `S` subscribers |

---

## 4. Data Structures & Algorithms (`server/dsa/`)

All core retrieval, routing, and billing aggregation functions are implemented from scratch in TypeScript without external algorithm libraries:

1. **Radix / Prefix Trie (`server/dsa/prefixTrie.ts`)**:
   - **DID Prefix Autocomplete**: Indexes all provisioned E.164 numbers (`+1415...`, `+1212...`, `+4420...`, `+4969...`, `+813...`) so prefix queries traverse only `L` characters (`O(L)`) followed by bounded subtree DFS (`O(L + M)`).
   - **Longest Prefix Match (LPM)**: Evaluates outbound destination E.164 numbers against the carrier rate-deck trie in `O(L)` time to resolve the deepest matching termination tariff and preferred PoP.
2. **Fenwick Tree / Binary Indexed Tree (`server/dsa/fenwickTree.ts`)**:
   - Maintains 24 hourly billing buckets backed by a `Float64Array`.
   - Point updates (`update(hour, chargeUsd)`) and arbitrary time-window range queries (`rangeSum(startHour, endHour)`) execute in **`O(log N)`** time using bit manipulation (`idx & -idx`).
3. **Binary Min-Heap Priority Queue (`server/dsa/minHeap.ts`)**:
   - Extracts the **Top-K costliest SIP trunks** (`K = 4`) across `N` active connections in **`O(N log K)`** time and **`O(K)`** auxiliary memory without sorting the entire trunk table.
4. **Circular Ring Buffer (`server/dsa/ringBuffer.ts`)**:
   - Fixed-capacity (`256` slots) pre-allocated circular array for **`O(1)`** CDR/MDR ingestion with zero garbage-collection pauses.
5. **Sliding Window Spend Tracker (`server/dsa/slidingWindow.ts`)**:
   - Timestamped FIFO queue with amortized **`O(1)`** expiration pruning over a 300-second window to detect real-time spend burn spikes (`$/min`).

---

## 5. Telnyx Billing & Operations Capabilities

- **Prepaid Balance & Credit Ledger**: Live tracking of `Current Prepaid Balance`, `Credit Limit`, `Available Credit`, `Pending Unbilled Usage`, `Daily Burn Rate`, and `Projected Cycle Total`.
- **Auto-Recharge & Budget Guardrails**: Interactive configuration (`PATCH /api/v1/billing/config`) for monthly spend caps, low-balance auto-recharge triggers, and top-up amounts, plus manual credit top-ups (`POST /api/v1/billing/topup`).
- **Product & Billing Group Cost Allocation**: Breakdown across `Elastic SIP Trunking`, `Programmable Voice API`, `Messaging API (10DLC & Toll-Free)`, `Phone Numbers & DIDs`, `Verify & Lookup`, and `Emergency E911 & Regulatory`, plus departmental Billing Groups.
- **Invoices & Statement Drawer**: Monthly invoice history (`INV-2026-1101` .. `INV-2026-0801`) with a slide-over itemized breakdown drawer and one-click RFC-4180 CSV ledger export.
- **Live Telnyx v2 API Support**: Set `TELNYX_API_KEY` in `.env` to query live account balances from `https://api.telnyx.com/v2/balance` through the Circuit Breaker; when omitted, the backend runs its deterministic Carrier Telemetry Engine.

---

## 6. API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check and process uptime |
| `GET` | `/api/v1/dashboard` | Full dashboard snapshot (LRU-cached, Min-Heap Top-K, Fenwick, RingBuffer) |
| `POST` | `/api/v1/sync` | Synchronize with Telnyx v2 API (protected by Circuit Breaker) |
| `GET` | `/api/v1/billing/range?startHour=0&endHour=23` | `O(log N)` Fenwick Tree range sum query for spend, calls, and SMS |
| `PATCH` | `/api/v1/billing/config` | Update monthly budget cap and auto-recharge threshold/amount |
| `POST` | `/api/v1/billing/topup` | Credit account balance and append settlement record to RingBuffer |
| `POST` | `/api/v1/billing/simulate-spike` | Inject burst CDRs to test Fenwick updates, Sliding Window alerts, & Auto-Recharge |
| `GET` | `/api/v1/dids/search?prefix=+1415` | `O(L)` Prefix Trie DID search with microsecond latency telemetry |
| `GET` | `/api/v1/routing/lpm?e164=+496912008841` | Longest Prefix Match tariff resolution + Consistent Hash PoP lookup |
| `POST` | `/api/v1/system/pop-failover` | Toggle PoP failover state and rebalance Consistent Hash Ring |
| `POST` | `/api/v1/system/circuit-breaker` | Trip or reset the 3-state Circuit Breaker (`trip` / `reset`) |
| `GET` | `/api/v1/stream` | Server-Sent Events (SSE) real-time CDR & billing stream |

---

## 7. Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Optional: configure TELNYX_API_KEY in .env (see .env.example)
cp .env.example .env

# 3. Start full-stack development server (Express + Vite on port 3000)
npm run dev

# 4. Type-check and build for production
npm run lint
npm run build
npm start
```

---

## 8. Reference Specification Prompt

If you want to reproduce or extend this architecture in another environment, use the specification below:

> Build a full-stack **Telnyx Carrier & Billing Monitor** with a **3D Three.js spatial topology entry page** and an **operations & FinOps dashboard**:
> 1. **Frontend Entry & Navigation**: Render an interactive 3D WebGL carrier topology scene with regional Telnyx PoP nodes, optical fiber conduits, camera presets, and a prominent **`Click here`** button that transitions through a multi-step animated loader into the main dashboard.
> 2. **Visual Discipline**: Use a flat, solid architectural color palette with **zero CSS or SVG gradients**, `tabular-nums` monospace numerals, 1px hairline borders, and a non-AI NOC/FinOps workstation layout.
> 3. **Telnyx Billing & Carrier Monitoring**: Monitor Prepaid Balance, Credit Limit, Auto-Recharge rules, Monthly Budget Cap, Burn Rate, Hourly Spend, Product Line Breakdown, Billing Groups, Monthly Invoices with line-item drawers, SIP Trunk KPIs (ASR, ACD, PDD, MOS), E.164 DID inventory, and live CDR/MDR streams.
> 4. **Backend System Design & DSA Core**: Implement an Express API gateway protected by a **Token Bucket Rate Limiter**, **Doubly-Linked-List LRU Cache**, **3-State Circuit Breaker**, **Consistent Hash Ring with Virtual Nodes**, and **Pub/Sub SSE Event Bus**, backed by custom **Prefix Trie (with Longest Prefix Match)**, **Fenwick Tree**, **Binary Min-Heap**, **Circular Ring Buffer**, and **Sliding Window** modules.
