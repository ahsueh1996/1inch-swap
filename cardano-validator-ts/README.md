# CardanoSwap+ Fusion TypeScript Validators

TypeScript implementation of Cardano validators compatible with [1inch Fusion](https://fusion.1inch.io/) cross-chain swap infrastructure, featuring partial fill support and advanced HTLC functionality.

## 🚀 Features

### Core Capabilities
- **Single & Multiple Fill Support**: Handle both simple and complex orders via merkle trees
- **Asset Agnostic**: Works with ADA and native Cardano tokens
- **Time-locked Operations**: Secure deadline management with public finalization
- **Partial Withdrawals**: UTXO recreation for partial fill scenarios
- **Safety Deposits**: Incentivized public operations for fault tolerance
- **Fusion Integration**: Direct compatibility with 1inch Fusion SDK

### Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   1inch Fusion  │───▶│  EVM Contracts   │───▶│ Cardano Escrow  │
│   Order Book    │    │  (EscrowSrc)     │    │  (EscrowDst)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌────────▼────────┐             │
         └─────────────▶│  Cross-Chain    │◀────────────┘
                        │  Watcher/Relay  │
                        └─────────────────┘
```
Note: Above is the flow for Maker on EVM and Taker on Cardano. In the reverse direction where Maker is on Cardano and Taker on EVM, we will use EscrowSrc on Cardano and EscrowDst on EVM instead.
Function available is in parallel with the onchain escrow functions on [cross-chain-swap](https://github.com/1inch/cross-chain-swap/tree/master/contracts)

## 📦 Installation

```bash
npm install
npm run build
```

## 🔧 Usage

### Basic Setup

```typescript
import { Lucid } from "lucid-cardano";
import Sdk from "@1inch/cross-chain-sdk";
import {
  FusionEscrowBuilder,
  FusionCardanoIntegration
} from "cardanoswap-fusion-validators";

// Initialize Lucid and Fusion SDK
const lucid = await Lucid.new(/* provider config */);
const fusionSdk = new Sdk.CrossChainSDK({
  apiKey: "your-fusion-api-key",
  provider: evmProvider
});

// Create integration layer
const integration = new FusionCardanoIntegration(lucid, fusionSdk);
```

### Deploy Cardano Escrow

```typescript
const result = await integration.deployCardanoEscrow({
  fusionOrder: crossChainOrder,
  resolverAddress: "addr1_resolver_address",
  beneficiaryAddress: "addr1_user_address",
  secret: "0x1234567890abcdef...",
  fillAmount: 1000000n, // 1 ADA
  fillId: 1
});

console.log(`Escrow deployed: ${result.txHash}`);
console.log(`Secret hash: ${result.secretHash}`);
```

### Handle Withdrawals

```typescript
// Single fill withdrawal
await integration.handlePartialWithdrawal({
  orderHash: "0xabcdef...",
  secret: "0x1234567890abcdef...",
  amount: 500000n, // 0.5 ADA
  beneficiaryAddress: "addr1_user_address"
});

// Multiple fill with merkle proof
await integration.handlePartialWithdrawal({
  orderHash: "0xabcdef...",
  secret: "0x1234567890abcdef...",
  amount: 250000n,
  beneficiaryAddress: "addr1_user_address",
  merkleProof: {
    leaf_index: 3,
    proof_elements: ["0xabc...", "0xdef..."]
  }
});
```

### Monitor Cross-Chain Execution

```typescript
await integration.monitorAndExecute({
  orderHash: "0xabcdef...",
  onSecretRevealed: async (secret) => {
    console.log(`Secret revealed: ${secret}`);
    // Trigger Cardano withdrawal
  },
  onTimeout: async () => {
    console.log("Order timed out, initiating refund");
    // Handle cancellation
  }
});
```

## 🏗️ Validator Architecture

### FusionEscrowDst Validator

The main validator implementing destination escrow functionality:

```typescript
export const FusionEscrowDatum = pstruct({
  FusionEscrowDatum: {
    maker: PPubKeyHash.type,           // Order creator
    resolver: PPubKeyHash.type,        // EVM side filler
    beneficiary: PPubKeyHash.type,     // Final recipient
    asset_policy: bs,                  // Token policy (empty for ADA)
    asset_name: bs,                    // Token name (empty for ADA)
    remaining: int,                    // Remaining amount
    hashlock: bs,                      // Secret hash (single fill)
    user_deadline: int,                // User withdrawal deadline
    cancel_after: int,                 // Cancellation deadline
    deposit_lovelace: int,             // Safety deposit
    merkle_root: PMaybe(bs).type,      // Multi-fill merkle root
    secret_index: int,                 // Current secret index
    total_amount: int,                 // Original amount
    order_hash: bs,                    // Fusion order hash
    fill_id: int                       // Fill instance ID
  }
});
```

### Supported Operations

1. **Withdraw**: User withdraws with valid secret
2. **PublicWithdraw**: Anyone can finalize after timeout (earns deposit)
3. **Cancel**: Resolver cancels and gets refund after timeout
4. **PublicCancel**: Anyone can cancel after extended timeout (earns deposit)

## 🧪 Testing

```bash
npm test
```

Test files cover:
- Single fill scenarios
- Multiple fill with merkle proofs
- Timeout and cancellation flows
- Public operation incentives
- Asset compatibility (ADA + native tokens)

## 🔨 Compilation

Generate Plutus scripts for deployment:

```bash
npm run compile-contracts
```

This creates:
- `plutus/fusion-validators.json` - Complete compilation output
- `plutus/scripts/fusion-escrow-dst.plutus` - Raw Plutus script

## 📋 Integration with CardanoSwap+ Design

This implementation follows the [CardanoSwap+ design](../cardanoswapplus-design.md):

| Component | Status | Description |
|-----------|--------|-------------|
| ✅ EscrowDst Validator | Complete | Cardano destination escrow with partial fills |
| ✅ Merkle Tree Support | Complete | Multi-secret validation for partial fills |
| ✅ Fusion SDK Integration | Complete | Direct compatibility with 1inch Fusion |
| ✅ Time-lock Management | Complete | Deadline validation and timeout handling |
| ✅ Public Operations | Complete | Incentivized finalization for fault tolerance |
| 🔄 Watcher Service | In Progress | Cross-chain monitoring and secret propagation |

## 🔐 Security Features

- **Hash Time-Locked Contracts (HTLC)**: Atomic cross-chain swaps
- **Merkle Tree Validation**: Secure partial fill proofs
- **Time-lock Safety**: Multiple timeout layers for different scenarios
- **Deposit Incentives**: Economic security for public operations
- **Asset Validation**: Strict checking of payment amounts and recipients

## 🚧 Roadmap

- [ ] Enhanced merkle tree optimizations
- [ ] Multi-asset escrow support
- [ ] Advanced auction mechanisms
- [ ] MEV protection enhancements
- [ ] Governance integration

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

For questions or support, please open an issue or contact the CardanoSwap+ team.