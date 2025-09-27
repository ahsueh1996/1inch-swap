# Cardano Source Escrow - EVM Parallel Implementation

This directory contains the Cardano TypeScript implementation of source escrow functionality that mirrors the EVM `escrowSrc.sol` contract. The implementation provides parallel cross-chain atomic swap capabilities with identical business logic and timing phases.

## Overview

The source escrow contract is responsible for:
1. **Initial fund locking** during contract deployment
2. **Secret-based withdrawals** by the taker (with various access levels)
3. **Timeout-based cancellations** returning funds to the maker
4. **Public operation incentives** through safety deposits

## EVM to Cardano Mapping

### Contract Functions

| EVM Function | Cardano Redeemer | Description |
|--------------|------------------|-------------|
| `withdraw(secret, immutables)` | `Withdraw { secret, amount, merkle_proof }` | Taker withdraws to own address |
| `withdrawTo(secret, target, immutables)` | `WithdrawTo { secret, amount, target, merkle_proof }` | Taker withdraws to specified target |
| `publicWithdraw(secret, immutables)` | `PublicWithdraw { secret, amount, merkle_proof }` | Anyone can withdraw (earns deposit) |
| `cancel(immutables)` | `Cancel {}` | Maker cancels and gets refund |
| `publicCancel(immutables)` | `PublicCancel {}` | Anyone can cancel (earns deposit) |

### Timeline Phases

Both implementations follow identical timing phases:

```
---- contract deployed ----/---- finality ----/---- PRIVATE WITHDRAWAL ----/---- PUBLIC WITHDRAWAL ----/
----/---- private cancellation ----/---- public cancellation ----
```

1. **Finality Period**: Wait for blockchain finality before allowing withdrawals
2. **Private Withdrawal**: Only taker can withdraw with valid secret
3. **Public Withdrawal**: Anyone can withdraw with valid secret (earns deposit)
4. **Private Cancellation**: Only maker can cancel and get refund
5. **Public Cancellation**: Anyone can cancel (earns deposit)

### Data Structures

#### FusionEscrowSrcDatum
```typescript
{
  maker: PPubKeyHash,           // User who funded the escrow
  resolver: PPubKeyHash,        // Cross-chain resolver
  beneficiary: PPubKeyHash,     // Taker who can withdraw
  asset_policy: bs,             // Native token policy (empty for ADA)
  asset_name: bs,               // Native token name (empty for ADA)
  remaining: int,               // Amount available for withdrawal
  initial_amount: int,          // Original deposited amount
  hashlock: bs,                 // SHA-256 hash of secret
  user_deadline: int,           // Private withdrawal deadline
  public_deadline: int,         // Public withdrawal deadline
  cancel_after: int,            // Cancellation start time
  deposit_lovelace: int,        // Safety deposit for public operations
  merkle_root: Maybe(bs),       // Multi-fill merkle root
  order_hash: bs,               // 1inch Fusion order identifier
  fill_id: int,                 // Unique fill instance ID
  finality_blocks: int,         // Finality wait period
  deployed_at_block: int        // Deployment block number
}
```

#### Redeemer Types
```typescript
FusionEscrowSrcRedeemer =
  | Withdraw { secret, amount, merkle_proof }
  | PublicWithdraw { secret, amount, merkle_proof }
  | Cancel {}
  | PublicCancel {}

FusionEscrowSrcExtendedRedeemer =
  | WithdrawTo { secret, amount, target, merkle_proof }
  | Withdraw { secret, amount, merkle_proof }
  | PublicWithdraw { secret, amount, merkle_proof }
  | Cancel {}
  | PublicCancel {}
```

## Usage Examples

### 1. Deploy Source Escrow (Fund Locking)

```typescript
import { FusionEscrowBuilder } from "./builders/escrow-builder";

const blockfrostProjectId = "your_blockfrost_project_id";
const networkId = 0; // 0 for testnet, 1 for mainnet
const builder = new FusionEscrowBuilder(blockfrostProjectId, networkId);

const deployTx = await builder.deploySourceEscrow({
  maker: makerAddress,
  taker: takerAddress,
  resolver: resolverAddress,
  amount: 1000000n, // 1 ADA in lovelaces
  secret_hash: secretHash,
  finality_time: Math.floor(Date.now() / 1000) + 600, // 10 minutes
  private_cancel_time: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  public_cancel_time: Math.floor(Date.now() / 1000) + 7200, // 2 hours
  deposit_lovelace: 2000000n, // 2 ADA deposit
  order_hash: fusionOrderHash,
  fill_id: 1,
  merkle_root: merkleRoot // optional for multi-fill
});
```

### 2. Taker Withdrawal (Private Phase)

```typescript
// Withdraw to taker's own address
const withdrawTx = await builder.withdrawFromSource({
  escrowUtxo: escrowUtxo,
  secret: preimage,
  amount: 1000000n,
  taker_address: takerAddress
});

// Withdraw to different target address
const withdrawToTx = await builder.withdrawToFromSource({
  escrowUtxo: escrowUtxo,
  secret: preimage,
  amount: 1000000n,
  to_address: targetAddress
});
```

### 3. Public Withdrawal (Anyone Can Call)

```typescript
const publicWithdrawTx = await builder.publicWithdrawFromSource({
  escrowUtxo: escrowUtxo,
  secret: preimage,
  amount: 1000000n,
  taker_address: takerAddress,
  caller_address: callerAddress // Gets deposit reward
});
```

### 4. Cancellation

```typescript
// Private cancellation (maker only)
const cancelTx = await builder.cancelSource({
  escrowUtxo: escrowUtxo,
  maker_address: makerAddress
});

// Public cancellation (anyone can call)
const publicCancelTx = await builder.publicCancelSource({
  escrowUtxo: escrowUtxo,
  maker_address: makerAddress,
  caller_address: callerAddress // Gets deposit reward
});
```

## Key Differences from Destination Escrow

1. **Initial State**: Source escrow starts with funds locked, destination starts empty
2. **Withdrawal Direction**: Source pays to taker, destination pays to maker
3. **Cancellation**: Source refunds to maker, destination has different cancellation logic
4. **Timeline**: Source has finality period before allowing operations

## Security Features

### Time-Based Access Control
- **Finality Protection**: Prevents withdrawal before blockchain finality
- **Phase Transitions**: Clear progression through withdrawal and cancellation phases
- **Public Incentives**: Safety deposits encourage public participation when needed

### Secret Protection
- **Single Fill**: Direct hashlock validation against SHA-256
- **Multi Fill**: Merkle tree proof validation for partial withdrawals
- **Proof Requirements**: Merkle proofs required for multi-fill scenarios

### Asset Safety
- **Amount Validation**: Ensures withdrawal amounts don't exceed remaining balance
- **Script Continuation**: Proper UTXO handling for partial withdrawals
- **Payment Verification**: Validates payments go to correct recipients

## Integration with 1inch Fusion

The implementation is designed to integrate seamlessly with 1inch Fusion's cross-chain infrastructure:

- **Order Tracking**: `order_hash` links to Fusion order system
- **Fill Management**: `fill_id` enables multiple fill tracking
- **Resolver System**: `resolver` field supports cross-chain verification
- **Multi-Fill Support**: Merkle trees enable efficient partial fills

## Testing

Use the provided test utilities to validate functionality:

```bash
npm run test:escrow-src
```

Tests cover:
- All redeemer types and their validation logic
- Time-based access control at different phases
- Secret validation (single and multi-fill)
- Payment verification and script continuation
- Edge cases and security scenarios

## Deployment

The validators are compiled to Plutus V3 and can be deployed on:
- **Cardano Testnet**: For development and testing
- **Cardano Mainnet**: For production cross-chain swaps

```typescript
import {
  fusionEscrowSrcExtendedScript,
  fusionEscrowSrcExtendedMainnetAddr,
  fusionEscrowSrcExtendedTestnetAddr
} from "./validators/fusion-escrow-src-extended";
```

This implementation ensures feature parity with the EVM escrowSrc.sol contract while leveraging Cardano's native capabilities for secure, efficient cross-chain atomic swaps.