# Cardano Resolver for 1inch Fusion

**Lean off-chain resolver service** that enables Cardano in 1inch Fusion auctions.

## Architecture

```
1inch Fusion Order → Off-Chain Resolver → Cardano Plutus Escrow
                           ↓
                    EVM LOP Execution
```

**Key Principle**: Minimal on-chain footprint, maximum compatibility with existing 1inch infrastructure.

## Core Components

1. **Fusion Monitor** - Watches for Cardano-destination orders
2. **Auction Bidder** - Competes for profitable swaps
3. **Cross-Chain Executor** - Coordinates EVM + Cardano transactions
4. **State Tracker** - Monitors swap progress

## Usage

```bash
npm start  # Start resolver service
```

Service automatically:
- Monitors 1inch Fusion for Cardano orders
- Bids competitively in auctions
- Executes profitable cross-chain swaps
- Manages timelock deadlines

## Configuration

```env
FUSION_ENDPOINT=wss://fusion.1inch.io
CARDANO_NETWORK=mainnet
BLOCKFROST_API_KEY=your_key
RESOLVER_PRIVATE_KEY=your_key
MIN_PROFIT_BASIS_POINTS=50
```

## Resolver Flow

1. **Monitor**: Watch Fusion orders with `takerAsset` on Cardano
2. **Bid**: Calculate profitability and submit competitive rates
3. **Execute**: Fill EVM side via LOP, deploy Cardano escrow
4. **Complete**: Wait for secret reveal, withdraw both sides

No custom contracts needed - uses existing 1inch infrastructure + Cardano Plutus contracts.