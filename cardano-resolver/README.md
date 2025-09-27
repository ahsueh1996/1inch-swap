# Cardano Resolver for 1inch Fusion

A sophisticated off-chain resolver that integrates with 1inch Fusion to facilitate cross-chain atomic swaps between EVM chains and Cardano.

## Features

- **1inch Fusion SDK Integration**: Real-time order monitoring and competitive bidding
- **Cross-Chain Transaction Builders**: Automated EVM and Cardano transaction execution
- **Secret Propagation**: Secure HTLC secret management and cross-chain revelation
- **Refund Management**: Automated timeout handling and emergency refund capabilities
- **Database Persistence**: SQLite-based state management with audit trails
- **Event-Driven Architecture**: Real-time monitoring and responsive execution

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   1inch Fusion  │───▶│  Cardano Resolver │───▶│    Cardano      │
│     Orders      │    │                  │    │    Network      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   EVM Network    │
                       │   (Ethereum)     │
                       └──────────────────┘
```

## Components

### Core Resolver (`src/resolver.ts`)
- Main orchestrator for cross-chain swaps
- Fusion SDK integration and order monitoring
- Event-driven swap lifecycle management

### Transaction Builders
- **EVM Builder** (`src/builders/evm-builder.ts`): Ethereum transaction construction and execution
- **Cardano Builder** (`src/builders/cardano-builder.ts`): Cardano transaction building with Lucid

### Secret Management (`src/secret-manager.ts`)
- Cryptographically secure secret generation
- Cross-chain secret propagation
- HTLC secret reveal monitoring

### Refund Manager (`src/refund-manager.ts`)
- Timeout-based refund automation
- Emergency refund capabilities
- Multi-chain refund coordination

### Database Layer (`src/database.ts`)
- SQLite-based persistence
- Swap state management
- Audit trail and event logging

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file based on the example:

```bash
# EVM Configuration
EVM_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/your-api-key
RESOLVER_PRIVATE_KEY=0x1234567890abcdef...

# Cardano Configuration
BLOCKFROST_API_KEY=your-blockfrost-api-key

# 1inch Fusion Configuration
FUSION_API_KEY=your-fusion-api-key

# Resolver Settings
MIN_PROFIT_BASIS_POINTS=50
REFUND_TIMEOUT_HOURS=24
DB_PATH=./data/resolver.db
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## API Reference

### Resolver Configuration

```typescript
interface ResolverConfig {
  fusionEndpoint: string;          // 1inch Fusion WebSocket endpoint
  evmRpcUrl: string;              // EVM RPC URL
  cardanoNetwork: 'mainnet' | 'testnet';
  blockfrostApiKey: string;       // Blockfrost API key
  resolverPrivateKey: string;     // Resolver wallet private key
  minProfitBasisPoints: number;   // Minimum profit threshold (bp)
  dbPath: string;                 // Database file path
  fusionApiKey?: string;          // Optional Fusion API key
  refundTimeoutHours: number;     // Refund timeout duration
}
```

### Swap Lifecycle

1. **Order Detection**: Monitor 1inch Fusion for Cardano orders
2. **Profitability Analysis**: Calculate cross-chain swap economics
3. **Competitive Bidding**: Submit quotes to Fusion auctions
4. **Execution**: Deploy escrows on both chains
5. **Secret Management**: Handle HTLC secret propagation
6. **Completion**: Claim funds upon secret revelation
7. **Refund Handling**: Automated timeout and cancellation

### Events

```typescript
resolver.on('swapCompleted', ({ orderHash, swap }) => {
  console.log(`Swap ${orderHash} completed successfully`);
});

resolver.on('swapCancelled', ({ orderHash, swap }) => {
  console.log(`Swap ${orderHash} was cancelled`);
});

resolver.on('refundCompleted', ({ orderHash }) => {
  console.log(`Refund processed for ${orderHash}`);
});
```

## Security Considerations

- **Private Key Management**: Store resolver private keys securely
- **Secret Generation**: Uses cryptographically secure randomness
- **Database Encryption**: Consider encrypting sensitive database fields
- **Network Security**: Use secure RPC endpoints and API keys
- **Timeout Handling**: Proper timelock management prevents fund loss

## Monitoring

The resolver provides comprehensive monitoring capabilities:

- Real-time swap status tracking
- Database-backed audit trails
- Event logging and statistics
- Refund monitoring and automation

## Error Handling

- Automatic retry mechanisms for transient failures
- Emergency refund procedures for critical situations
- Comprehensive error logging and alerting
- Graceful degradation under network issues