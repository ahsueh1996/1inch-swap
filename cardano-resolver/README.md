# Cardano Resolver for 1inch Cross-Chain Swaps

A Cardano resolver implementation based on 1inch's cross-chain resolver patterns, enabling EVM ↔ Cardano atomic swaps through the official 1inch infrastructure.

## Architecture Overview

This resolver extends 1inch's proven cross-chain swap architecture to support Cardano, providing:

- **Official 1inch Integration**: Uses 1inch Fusion orders and cross-chain SDK
- **Atomic Swap Safety**: HTLC-based secret commitment across chains
- **Partial Fill Support**: Merkle tree-based secret management for multiple fills
- **Time-locked Security**: Multi-stage timelock periods for withdrawal/cancellation

## Key Components

### 1. EVM Resolver Contract (`CardanoResolver.sol`)
- Extends official 1inch Resolver pattern
- Handles EVM-side escrow deployment and management
- Integrates with LimitOrderProtocol for order execution

### 2. Cardano Coordination Service (`cardano-service.ts`)
- Monitors EVM events for Cardano escrow deployment
- Manages Plutus contract interactions
- Handles secret revelation and withdrawal coordination

### 3. Cross-Chain State Manager (`state-manager.ts`)
- Tracks order status across both chains
- Manages timelock transitions and deadlines
- Provides real-time swap progress monitoring

## Resolver Flow

### EVM → Cardano Swap
1. **Order Creation**: User creates 1inch CrossChainOrder with Cardano destination
2. **EVM Deployment**: Resolver calls `deploySrc()` to create EVM escrow
3. **Cardano Escrow**: Service deploys corresponding Cardano Plutus contract
4. **Secret Reveal**: User provides secret to claim Cardano funds
5. **EVM Withdrawal**: Resolver uses same secret to claim EVM funds

### Cardano → EVM Swap
1. **Cardano Escrow**: User deploys Cardano escrow with hashlock
2. **EVM Deployment**: Resolver calls `deployDst()` for EVM escrow
3. **Secret Reveal**: User provides secret to claim EVM funds
4. **Cardano Withdrawal**: Resolver uses secret for Cardano funds

## Features

### ✅ Based on Official 1inch Infrastructure
- Uses `@1inch/cross-chain-sdk` for order management
- Integrates with real LimitOrderProtocol contracts
- Supports 1inch's auction and whitelist mechanisms

### ✅ Cardano Native Integration
- Plutus V3 contracts for maximum efficiency
- Native ADA and Cardano token support
- Proper UTXO management and validation

### ✅ Advanced Order Features
- **Single Fill**: Simple one-time swaps with single secret
- **Multiple Fills**: Partial fills using Merkle tree secrets
- **Dutch Auctions**: Time-based rate improvement
- **Whitelisting**: Resolver access control

### ✅ Security & Safety
- Multi-stage timelock periods
- Safety deposits prevent griefing
- Emergency cancellation mechanisms
- Cross-chain finality handling

## Differences from ronakgupta11's Implementation

| Feature | ronakgupta11/cardano-swap | This Implementation |
|---------|---------------------------|-------------------|
| **1inch Integration** | Custom LOP, no Fusion | Official Fusion + SDK |
| **Order Discovery** | Manual backend API | 1inch auction mechanism |
| **Resolver Competition** | Single resolver | Multiple resolver competition |
| **Rate Discovery** | Fixed rates | Dutch auction pricing |
| **Partial Fills** | All-or-nothing | Merkle tree-based partials |
| **Timelock Management** | Simple periods | Multi-stage sophisticated locks |
| **Infrastructure** | Standalone system | Integrated with 1inch network |

## Installation

```bash
cd cardano-resolver
npm install
```

## Configuration

```typescript
// config.ts
export const config = {
  evm: {
    chainId: 1, // Ethereum mainnet
    limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65',
    escrowFactory: '0x...', // 1inch EscrowFactory address
  },
  cardano: {
    network: 'mainnet',
    blockfrostApiKey: process.env.BLOCKFROST_API_KEY,
    plutusScriptPath: './contracts/escrow.plutus',
  },
  resolver: {
    privateKey: process.env.RESOLVER_PRIVATE_KEY,
    cardanoSeed: process.env.CARDANO_SEED_PHRASE,
  }
};
```

## Usage

### Start Resolver Service
```bash
npm run start
```

### Monitor Orders
```bash
npm run monitor -- --chain ethereum --destination cardano
```

### Manual Resolve
```bash
npm run resolve -- --order-hash 0x123... --src-chain ethereum --dst-chain cardano
```

## Testing

```bash
# Run unit tests
npm test

# Integration tests (requires testnet access)
npm run test:integration

# E2E tests with local devnets
npm run test:e2e
```

## Deployment

### Testnet Deployment
```bash
npm run deploy:testnet
```

### Mainnet Deployment
```bash
npm run deploy:mainnet
```

## Monitoring & Analytics

The resolver provides comprehensive monitoring:

- **Order tracking**: Real-time status across chains
- **Performance metrics**: Fill rates, timing analytics
- **Error reporting**: Failed transactions and recovery
- **Profitability analysis**: Gas costs vs resolver fees

## Security Considerations

- **Private Key Management**: Use secure key storage (HSM recommended)
- **Rate Limiting**: Prevent spam orders and DoS attacks
- **Slippage Protection**: Monitor market conditions for fair execution
- **Emergency Procedures**: Circuit breakers for critical failures

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see [LICENSE](../LICENSE) for details.

## Support

- **Documentation**: See `/docs` folder for detailed guides
- **Issues**: Report bugs via GitHub Issues
- **Discord**: Join 1inch community for discussions