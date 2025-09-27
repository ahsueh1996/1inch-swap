# CardanoSwap+ 
Modelling after Ronakgupta11's HTLC design but empowered with Fusion+'s dutch auction price discovery.

## Overview
1. Fusion Layer (off-chain Dutch auction + resolver selection)
2. EVM components (Escrow contracts)
3. Cardano components (EscrowDst-equivalent validator with UTXO-based partial fill extension)
4. Watcher (bridges seecrets and timelocks to maintain atomicity)

## Architecture


## 1inch Fusion Integration Plan

### Fusion + Cross-Chain Swap + Cardano Integration Steps

| Step | Action | Component Responsible | Status |
|------|---------|------------------------|--------|
| 1 | User signs swap intent (tokens, amount, deadlines, auction params, partial-fill flag) | User client (front/back/cli/MCP) | ❌ Needs to be added (extend order builder with Fusion intent fields) |
| 2 | Intent is published for Dutch auction | Fusion API (off-chain) | ✅ Provided by 1inch Fusion |
| 3 | Resolvers watch auction and compete | Resolvers (network) | ✅ Already exists in Fusion infra (but ❌ need Cardano-aware resolver to handle Cardano HTLC) |
| 4 | Winning resolver fills order on EVM → fillOrderArgs triggers EscrowSrc deployment | EVM side (LOP + EscrowFactory) | ✅ Already in cross-chain-swap repo |
| 5 | Resolver deploys Cardano HTLC escrow (mirrors EscrowDst) with same hashlock/timelock | Resolver (Cardano side) | ❌ Needs Cardano validator + off-chain tx builder |
| 6 | Watcher/Relayer monitors both chains, propagates secret when revealed | Custom watcher service | ❌ Needs to be built |
| 7a | Normal full fill: secret revealed → User withdraws on Cardano; Resolver withdraws on EVM | Escrow contracts + Watcher | ✅ Supported on EVM; ❌ Cardano validator needs to mirror this |
| 7b | Partial fill: User withdraws a portion, Cardano validator re-creates new UTxO with updated datum (remainingAmount, secretIndex) | Cardano validator + Watcher | ❌ Requires extended validator logic (Merkle multi-secret, datum updates) |
| 8 | Timeout path: after timelock, refund → Maker withdraws source funds; Resolver withdraws deposits | Escrow contracts (publicCancel) | ✅ On EVM side (cross-chain-swap repo); ❌ Cardano validator must add this |
| 9 | Public finalize path: if resolver stalls, any party can complete swap and earn deposit | Anyone + Escrow logic | ✅ On EVM side (L386–391); ❌ Needs Cardano validator logic |


### Additional Notes for Cardano:

On Cardano:
1. The validator should be a Plutus validator with "escrow contracts" mirroring the `EscrowDst` semantics, implementing user withdrawal, resolver cancel and public finalize.
2. The watcher should be an offchain (backend/services/monitorService.js) service monitoring events on both chains, propagates secrets and triggers refunds/cancels when appropriate.
3. Notice that due to the nature of UTXO model, we do not need `EscrowSrc` and `EscrowFactor` since each UTXO is already an uniquely identifiable escrow (hoding specific token and a unqiue datum with hashlock, timelock and participants)!
4. To support partial fill, we need merkle multi-secret support, extended datum (to include remaining amount, current index and merkle root), as well as partial withdraw logic in the validator (recreate new escrow UTXO).


## Watcher

1. Fault tolerance: if the watcher goes down, swaps might expire and both sides will get refunded. Note that funds are safe because escrows are governed by hashlock + timelock so it's not like any party can steal funds. However, liveness will get impacted as swap would not complete without the secret reveal.
2. (Future) Incentivize people to run wawtchers by giving them deposit reward for finalizing swaps (like in `publicWithdraw` and `publicCancel`)
