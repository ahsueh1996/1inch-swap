# CardanoSwap+

Refer to [technical design of CardanoSwap+](./cardanoswapplus-design.md).

## Components
1. Relayer (Watcher) `./relayer`
2. Cardano Validators (Escrow Contracts) `./cardano-validator-ts`
3. Cardano Resolver `./cardano-resolver-plu-ts`

## Demo Run
Demo the bidirectional swap EVM <--> Cardano.

### Scenario #1 EVM -> Cardano
1. Maker signs an order on EVM to swap ETH for ADA on Cardano
2. Taker resolver on Cardano bids for order (Fusion dutch auction)
3. Relayer validates that params match on ETH (escrow src) and Cardano (escrow dst) and signal Maker client to compute and send secrets
4. Relayer forwards secret to winning Cardano resolver
5. Resolver trigger withdraws on ETH and Cardano

### Scenario #2 Cardano -> EVM
1. Maker signs an order on Cardano to swap ADA for ETH on Ethereum
2. Taker resolver on Ethereum bids for order (Fusion dutch auction)
3. Relayer validates that params match on ETH (escrow des) and Cardano (escrow src) and signal Maker client to compute and send secrets
4. Relayer forwards secret to winning ETH resolver
5. Resolver trigger withdraws on ETH and Cardano

### Scenario #3 Expired Resolver
1. Similar to scenario #1 but Resolver did not respond within specified time window so relayer publish the secret for public to resolve.

## Task
[1inch EthGlobal New Delhi Bounty](https://ethglobal.com/events/newdelhi/prizes/1inch)
[1inch Dev Resources](https://1inch.dev/?utm_source=2025_events_flyer&utm_medium=promo&utm_campaign=flyer)

🔗 Non-EVM Extensions for 1inch Cross-chain Swap (Fusion+) ⸺ $12,000
🥇
1st place
$6,000
🥈
2nd place
$4,000
🥉
3rd place
$2,000

Build a novel extension for 1inch Cross-chain Swap (Fusion+) that enables swaps between Ethereum and one of the following non-EVM chains: Sui, Aptos, Bitcoin/Bitcoin cash/Doge/Litecoin, Tron, Ton, Monad, Near, Starknet, Cardano, Stellar, XRP Ledger, ICP, Tezos, Polkadot, EOS, or Cosmos. (Solana is excluded because we have already built it)

Qualification Requirements
Requirements: 
- Preserve hashlock and timelock functionality for the non-EVM implementation. 
- Swap functionality should be bidirectional (swaps should be possible to and from Ethereum) 
- Onchain execution of token transfers should be presented during the final demo
- Proper Git commit history (no single-commit entries on the final day)

## Flow Diagram
```uml-sequence-diagram
title CardanoSwap+

participant CHAIN A
participant ESCROW A
participant RELAYER/WATCHER
participant ESCROW B
participant CHAIN B

CHAIN A->RELAYER/WATCHER:(1) user create signed intent (through fusion-sdk)
RELAYER/WATCHER->CHAIN B:(2) create order (invokes resolver's escrow factory)
ESCROW B<-CHAIN B:(3) resolver deposits safety deposit & swap amount
activate ESCROW B
ESCROW A<-CHAIN B:(4) resolver deposits user's tokens on src chain
activate ESCROW A
ESCROW A->RELAYER/WATCHER:(5a) check escrows have..
ESCROW B->RELAYER/WATCHER:(5b) ..exact same content
CHAIN A->RELAYER/WATCHER:(6a) user provides secret (from frontend)
RELAYER/WATCHER->CHAIN B:(6b) relayer passes secret to resolver
ESCROW A<-CHAIN B:(7) resolver unlocks tokens on src chain for themselves, simultaneously revealing secret to other resolvers
deactivate ESCROW A
ESCROW B<-CHAIN B:(8) resolver unlocks swapped token for user, recovering their safety deposit
deactivate ESCROW B
alt resolver (A) fails to unlock tokens in time
ESCROW B<-CHAIN B:(8 alt) resolver B unlocks token for user, taking resolver A's safety deposit
end
```
