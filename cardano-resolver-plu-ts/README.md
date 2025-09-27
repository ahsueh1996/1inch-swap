# Cardano Cross-Chain Resolver (plu-ts)

A sophisticated cross-chain resolver for Cardano using [plu-ts](https://github.com/HarmonicLabs/plu-ts) for on-chain smart contract development and interactions with 1inch Fusion.

## Features

- **plu-ts Smart Contracts**: Native Plutus V3 validators written in TypeScript
- **Cross-Chain Bridge**: Seamless asset transfers between EVM chains and Cardano
- **1inch Fusion Integration**: Competitive order fulfillment and auction participation
- **REST API**: Complete HTTP API for resolver operations
- **Hash Time-Locked Contracts (HTLC)**: Secure atomic swaps with cryptographic guarantees
- **Real-time Monitoring**: Event-driven order tracking and timeout management
- **Profit Optimization**: Built-in profitability analysis and bid optimization

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   EVM Chains    │◄──►│ Cardano Resolver │◄──►│    Cardano      │
│   (Ethereum)    │    │     (plu-ts)     │    │    Network      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   1inch Fusion   │
                       │     Orders       │
                       └──────────────────┘
```

## Components

### Smart Contracts (`src/contracts/`)

- **cardano-escrow.ts**: plu-ts Plutus V3 validator for secure cross-chain escrows
  - Supports ADA and native tokens
  - Hash time-locked contract (HTLC) logic
  - Public withdrawal with deposit rewards
  - Automatic cancellation after timeout

### Core Resolver (`src/resolvers/`)

- **cardano-resolver.ts**: Main resolver orchestrating cross-chain operations
  - Order creation and management
  - Escrow deployment and withdrawal
  - Secret management and revelation
  - Profitability calculations

### REST API (`src/api/`)

- **resolver-api.ts**: Complete HTTP API for external integrations
  - Order lifecycle management
  - Real-time status updates
  - Webhook support for cross-chain events

### Type Definitions (`src/types/`)

- **resolver-types.ts**: Comprehensive TypeScript interfaces
  - Cross-chain order structures
  - Cardano-specific parameters
  - Event and configuration types

## Installation

### Prerequisites

- Node.js 18+
- TypeScript 5.4+
- Cardano wallet seed phrase
- Blockfrost API key
- EVM private key

### Setup

```bash
# Clone and install dependencies
cd cardano-resolver-plu-ts
npm install

# Build the project
npm run build
```

For testnet ADA, checkout the [testnet faucets](https://docs.cardano.org/cardano-testnets/tools/faucet).

## Configuration

Create a `.env` file with the following variables:

```env
# Cardano Configuration
CARDANO_NETWORK=testnet
BLOCKFROST_API_KEY=your_blockfrost_api_key_here
WALLET_SEED=your_cardano_wallet_seed_phrase_here

# EVM Configuration
EVM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-api-key
EVM_PRIVATE_KEY=0x1234567890abcdef...

# 1inch Fusion (Optional)
FUSION_API_KEY=your_fusion_api_key

# Resolver Settings
MIN_PROFIT_BASIS_POINTS=100          # 1% minimum profit
MAX_SLIPPAGE_BASIS_POINTS=300        # 3% max slippage
API_PORT=3001                        # REST API port

# Optional Webhooks
WEBHOOK_URL=https://your-domain.com/webhook
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `CARDANO_NETWORK` | Cardano network (mainnet/testnet/preview/preprod) | ✅ | testnet |
| `BLOCKFROST_API_KEY` | Blockfrost API key for Cardano queries | ✅ | - |
| `WALLET_SEED` | Cardano wallet seed phrase | ✅ | - |
| `EVM_RPC_URL` | Ethereum RPC endpoint | ✅ | - |
| `EVM_PRIVATE_KEY` | EVM wallet private key | ✅ | - |
| `FUSION_API_KEY` | 1inch Fusion API key | ❌ | - |
| `MIN_PROFIT_BASIS_POINTS` | Minimum profit threshold (basis points) | ❌ | 100 |
| `MAX_SLIPPAGE_BASIS_POINTS` | Maximum slippage tolerance | ❌ | 300 |
| `API_PORT` | REST API server port | ❌ | 3001 |
| `WEBHOOK_URL` | Webhook endpoint for events | ❌ | - |

## Usage

### Development Mode

```bash
# Start with hot reloading
npm run dev

# Or run the resolver directly
npm run resolver
```

### Production Mode

```bash
# Build and start
npm run build
npm start
```

### Testing

```bash
# Run test suite
npm test
```

## API Reference

The resolver exposes a REST API on port `3001` (configurable).

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "network": "testnet"
}
```

### Create Cross-Chain Order

```bash
POST /api/v1/order/new
```

**Request Body:**
```json
{
  "makerAsset": {
    "policyId": "",
    "assetName": "",
    "amount": "1000000"
  },
  "takerAsset": {
    "token": "0xA0b86a33E6B3A43dcD3a1d99Dc4cdE6C5F7624b1",
    "amount": "1000000000000000000"
  },
  "srcChainId": 1,
  "deadline": 1640995200,
  "allowPartialFills": false,
  "allowMultipleFills": false
}
```

### Deploy Destination Escrow

```bash
POST /api/v1/escrow/deploy
```

**Request Body:**
```json
{
  "maker": "addr1...",
  "resolver": "addr1...",
  "beneficiary": "addr1...",
  "asset": {
    "policyId": "",
    "assetName": ""
  },
  "amount": "1000000",
  "hashlock": "abc123...",
  "userDeadline": 1640995200,
  "cancelAfter": 1640999999,
  "depositLovelace": "2000000",
  "orderHash": "0x...",
  "fillId": 1
}
```

### Withdraw from Escrow

```bash
POST /api/v1/escrow/withdraw
```

**Request Body:**
```json
{
  "orderHash": "0x...",
  "secret": "secret123...",
  "beneficiaryAddress": "addr1..."
}
```

### Get Order Status

```bash
GET /api/v1/order/{orderHash}/status
```

**Response:**
```json
{
  "success": true,
  "status": {
    "orderHash": "0x...",
    "status": "dst_deployed",
    "dstTxHash": "abc123...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "resolver": "addr1...",
    "fillAmount": "1000000",
    "remainingAmount": "1000000"
  }
}
```

### Get Active Orders

```bash
GET /api/v1/orders/active
```

### Calculate Profitability

```bash
POST /api/v1/order/profit
```

## plu-ts Smart Contract Details

### Cardano Escrow Validator

The core smart contract is written in plu-ts and compiles to Plutus V3:

```typescript
// Datum structure
export const CardanoEscrowDatum = pstruct({
  CardanoEscrowDatum: {
    maker: PPubKeyHash.type,
    resolver: PPubKeyHash.type,
    beneficiary: PPubKeyHash.type,
    asset_policy: bs,
    asset_name: bs,
    amount: int,
    hashlock: bs,
    user_deadline: int,
    cancel_after: int,
    deposit_lovelace: int,
    order_hash: bs,
    fill_id: int,
    src_chain_id: int
  }
});

// Redeemer actions
export const CardanoEscrowRedeemer = pstruct({
  Withdraw: { secret: bs },           // User withdrawal with secret
  PublicWithdraw: { secret: bs },     // Public withdrawal after timeout
  Cancel: {},                         // Resolver cancellation
  PublicCancel: {}                    // Public cancellation
});
```

### Validator Logic

1. **Withdraw**: User provides secret before deadline
2. **PublicWithdraw**: Anyone can withdraw after user deadline (earns deposit)
3. **Cancel**: Resolver cancels after timeout, gets refund
4. **PublicCancel**: Anyone can cancel after timeout (earns deposit)

### Contract Addresses

The plu-ts validator compiles to deterministic addresses:

- **Mainnet**: `addr1...` (generated from script hash)
- **Testnet**: `addr1...` (generated from script hash)

## Event System

The resolver emits various events for monitoring:

```typescript
resolver.on('dstDeployed', (event) => {
  console.log(`Escrow deployed: ${event.txHash}`);
});

resolver.on('orderCompleted', (event) => {
  console.log(`Order completed: ${event.orderHash}`);
});

resolver.on('orderTimeout', (event) => {
  console.log(`Order timed out: ${event.orderHash}`);
});

resolver.on('secretRevealed', (event) => {
  console.log(`Secret revealed: ${event.orderHash}`);
});
```

## Development

### Project Structure

```
src/
├── api/
│   └── resolver-api.ts          # REST API server
├── contracts/
│   └── cardano-escrow.ts        # plu-ts smart contract
├── resolvers/
│   └── cardano-resolver.ts      # Core resolver logic
├── types/
│   └── resolver-types.ts        # TypeScript definitions
└── index.ts                     # Main entry point
```

### Building Smart Contracts

The plu-ts validator is automatically compiled when the project builds:

```bash
npm run build
```

This generates the compiled Plutus script with deterministic hashes for both mainnet and testnet.

### Adding New Features

1. **Smart Contract Changes**: Modify `src/contracts/cardano-escrow.ts`
2. **API Endpoints**: Add routes in `src/api/resolver-api.ts`
3. **Core Logic**: Extend `src/resolvers/cardano-resolver.ts`
4. **Types**: Update `src/types/resolver-types.ts`

## Security Considerations

- **Private Key Storage**: Store wallet seeds and private keys securely
- **Secret Management**: Secrets are cryptographically generated using `crypto.randomBytes()`
- **Contract Validation**: plu-ts validators provide compile-time type safety
- **Timeout Handling**: Automatic refunds prevent fund locking
- **Deposit Mechanism**: Incentivizes proper execution and penalizes bad actors

## Monitoring and Logs

The resolver provides comprehensive logging:

```
🚀 Starting Cardano Cross-Chain Resolver...
✅ Cardano Resolver initialized on testnet
📍 Escrow Address: addr1...
👀 Starting order monitoring...
🌐 Resolver API listening on port 3001
📍 Health check: http://localhost:3001/health
✅ Cardano Resolver fully operational
```

## Troubleshooting

### Common Issues

1. **Blockfrost Connection Failed**
   - Verify API key is correct
   - Check network setting (mainnet/testnet)

2. **Wallet Not Found**
   - Ensure `WALLET_SEED` is a valid 24-word mnemonic
   - Check wallet has sufficient ADA for transactions

3. **Contract Compilation Errors**
   - Verify plu-ts version compatibility
   - Check TypeScript version (5.4+ required)

4. **Transaction Failures**
   - Ensure sufficient UTXOs in wallet
   - Check transaction fees and collateral

### Debug Mode

Enable detailed logging:

```bash
DEBUG=* npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details.