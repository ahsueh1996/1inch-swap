# CardanoSwap+ Watcher / Relayer

The Watcher / Relayer is an off-chain service that ensures fair and safe execution of cross-chain HTLC swaps between EVM and Cardano.

---

## 🎯 Purpose

The watcher:

1. Validates maker ↔ taker swap parameters across chains.
2. Mediates secret sharing between Maker and Resolver.
3. Enforces liveness by publishing secrets publicly if Resolver stalls.
4. Monitors deadlines and triggers refunds / public cancels.

This ensures fairness, safety, and liveness even when one party misbehaves.

---

## 🧩 Components

### 1. Swap Registry
- Persistent database of active swaps (SQLite/Redis).
- Fields:
  - orderId
  - Maker params (assets, amounts, deadlines, hashlock, addresses)
  - Taker params (from Fusion/LOP)
  - Status (pending, awaiting_secret, secret_shared, completed, expired)
  - Timestamps for deadlines

### 2. Parameter Validator
- Compares Maker escrow vs Taker Fusion order:
  - Asset types match
  - Ratio within tolerance
  - Deadlines safe (user_deadline < refund_after)
  - Same hashlock

### 3. Secret Mediator
- Signals Maker to provide secret (preimage).
- Holds secret until Resolver confirms readiness.
- Forwards secret to Resolver to finalize payout.

### 4. Liveness Enforcer
- Starts a countdown when secret is given to Resolver.
- If Resolver does not complete within X seconds:
  - Publishes secret publicly (IPFS, API, or broadcast).
  - Opens swap to any resolver to complete.

### 5. Timeout Monitor
- Watches all swaps:
  - If user_deadline passes → publish secret if available.
  - If cancel_after passes → call publicCancel.

---

## 🔄 Event Flow

1. Maker creates swap intent (Fusion order + on-chain escrow).
2. Watcher validates Maker ↔ Taker params → marks pending.
3. Watcher requests secret from Maker.
4. Resolver wins Fusion auction → Watcher forwards secret.
5. Resolver executes destination escrow.
6. If Resolver stalls past timeout:
   - Watcher publishes secret publicly.
   - Any other resolver can finish payout.
7. Watcher updates swap status (completed or expired).

---

## 🛡 Security Properties

- Fairness: Resolver only gets secret when ready.  
- Liveness: Secret goes public if Resolver stalls.  
- Safety: Maker funds only move if secret matches hashlock.  
- Transparency: Secrets & deadlines logged, optionally mirrored to IPFS.  

---

## ⚙️ Configurable Parameters

- maxSecretHoldTime → grace period before secret goes public  
- validationTolerance → % deviation allowed in amounts  
- pollInterval → chain monitoring frequency  

---

## 📊 Sequence Diagram

`mermaid
sequenceDiagram
    participant Maker
    participant Watcher
    participant Resolver
    participant Public

    Maker->>Watcher: Publish order (params + hashlock)
    Watcher->>Maker: Validate params, request secret
    Maker->>Watcher: Provide secret (hold in escrow)
    Watcher->>Resolver: Send secret (once auction won)
    Resolver->>Cardano/EVM: Execute escrow with secret
    Note over Resolver,Watcher: Grace period countdown
    alt Resolver finishes in time
        Watcher->>Watcher: Mark swap completed
    else Resolver stalls
        Watcher->>Public: Publish secret (IPFS / API)
        Public->>Cardano/EVM: Any resolver can complete
    end
    Watcher->>Watcher: Handle cancels / refunds on deadline