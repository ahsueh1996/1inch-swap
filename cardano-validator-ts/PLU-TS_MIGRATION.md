# PLU-TS Migration Documentation

## Overview

This document outlines the migration from Lucid-Cardano to PLU-TS for the CardanoSwap+ Fusion validators project. The migration consolidates transaction building functionality into a unified approach using PLU-TS's offchain capabilities.

## Migration Summary

### Completed Changes

1. **Dependency Removal**: Removed `lucid-cardano` from package.json
2. **Import Updates**: Replaced Lucid imports with PLU-TS equivalents
3. **Builder Consolidation**: Combined `FusionEscrowSrcBuilder` and `FusionEscrowBuilder` into unified `FusionEscrowBuilder`
4. **API Standardization**: Updated all method signatures to use consistent PLU-TS types

### Builder Consolidation

#### Before: Separate Builders
```typescript
// Old structure - separate files
src/builders/escrow-builder.ts         // Destination escrow only
src/builders/escrow-src-builder.ts     // Source escrow only

// Import pattern
import { FusionEscrowBuilder } from "./builders/escrow-builder";
import { FusionEscrowSrcBuilder } from "./builders/escrow-src-builder";
```

#### After: Unified Builder
```typescript
// New structure - single unified file
src/builders/escrow-builder.ts         // Both source and destination escrow

// Import pattern
import { FusionEscrowBuilder } from "./builders/escrow-builder";

// Usage for destination escrow
const destTx = await builder.deployDestinationEscrow(params);
const withdrawTx = await builder.withdrawFromDestination(params);

// Usage for source escrow
const srcTx = await builder.deploySourceEscrow(params);
const withdrawTx = await builder.withdrawFromSource(params);
```

## API Changes

### Constructor Changes
```typescript
// Before (separate builders)
const dstBuilder = new FusionEscrowBuilder("testnet");
const srcBuilder = new FusionEscrowSrcBuilder("testnet");

// After (unified builder)
const blockfrostProjectId = "your_blockfrost_project_id";
const networkId = 0; // 0 for testnet, 1 for mainnet
const builder = new FusionEscrowBuilder(blockfrostProjectId, networkId);
```

### Method Name Changes

#### Destination Escrow Methods
```typescript
// Before
builder.deployEscrow(params)
builder.withdraw(params)
builder.publicWithdraw(params)
builder.cancel(params)
builder.publicCancel(params)
builder.getEscrowUtxos(orderHash)

// After (explicit naming)
builder.deployDestinationEscrow(params)
builder.withdrawFromDestination(params)
builder.publicWithdrawFromDestination(params)
builder.cancelDestination(params)
builder.publicCancelDestination(params)
builder.getDestinationEscrowUtxos(orderHash)

// Legacy methods (for backward compatibility)
builder.deployEscrow(params)        // → deployDestinationEscrow
builder.withdraw(params)            // → withdrawFromDestination
builder.publicWithdraw(params)      // → publicWithdrawFromDestination
builder.cancel(params)              // → cancelDestination
builder.publicCancel(params)        // → publicCancelDestination
builder.getEscrowUtxos(orderHash)   // → getDestinationEscrowUtxos
```

#### Source Escrow Methods
```typescript
// Before (FusionEscrowSrcBuilder)
builder.buildDeployTx(params)
builder.buildWithdrawTx(params)
builder.buildWithdrawToTx(params)
builder.buildPublicWithdrawTx(params)
builder.buildCancelTx(params)
builder.buildPublicCancelTx(params)

// After (unified builder)
builder.deploySourceEscrow(params)
builder.withdrawFromSource(params)
builder.withdrawToFromSource(params)
builder.publicWithdrawFromSource(params)
builder.cancelSource(params)
builder.publicCancelSource(params)
builder.getSourceEscrowUtxos(orderHash)
```

### Parameter Changes

#### Address Handling
```typescript
// Before (mixed address types)
params: {
  maker: PubKeyHash,
  taker_address: string
}

// After (consistent string addresses)
params: {
  maker: string,           // Bech32 address string
  taker_address: string   // Bech32 address string
}
```

#### Network Configuration
```typescript
// Before
new FusionEscrowSrcBuilder("testnet")

// After
new FusionEscrowBuilder(blockfrostProjectId, 0) // 0 = testnet, 1 = mainnet
```

## PLU-TS Integration Approach

### Current Implementation Status

The migration uses placeholder implementations for PLU-TS functions that are not yet available or have API compatibility issues:

```typescript
// Placeholder implementations due to PLU-TS API limitations
const validatorAddress = Address.fromCredentials(
  this.networkId,
  fusionEscrowDstScript.hash
); // Note: fromCredentials may not exist in current PLU-TS version

const datum = new FusionEscrowDatum({
  FusionEscrowDatum: {
    maker: fromHex(params.maker),  // fromHex may not be available
    // ... other fields
  }
});
```

### Expected API Once PLU-TS Stabilizes

```typescript
// Expected working PLU-TS integration
import {
  Address,
  Tx,
  TxBuilder,
  Value,
  TxOut,
  DataI,
  fromHex,
  toHex
} from "@harmoniclabs/plu-ts";

// Blockchain interaction
import {
  BlockfrostPluts
} from "@harmoniclabs/blockfrost-pluts";

// Initialize Blockfrost connection
const blockfrost = new BlockfrostPluts({
  projectId: this.blockfrostProjectId,
  network: this.networkId === 1 ? "mainnet" : "testnet"
});

// Build transaction
const txBuilder = new TxBuilder(blockfrost);
const tx = await txBuilder.buildAndSubmit();
```

## Required Updates for Full Migration

### 1. Test File Updates
```typescript
// File: src/tests/escrow-src.test.ts
// Status: Needs complete rewrite for new API

// Old test pattern
const builder = new FusionEscrowSrcBuilder("testnet");
const deployTx = builder.buildDeployTx(params);

// New test pattern
const builder = new FusionEscrowBuilder("test_project", 0);
const deployTx = await builder.deploySourceEscrow(params);
```

### 2. Import Statement Updates
```typescript
// Files that need import updates
src/index.ts                    // ✅ Updated
src/tests/escrow-src.test.ts   // ⚠️  Needs API rewrite
README files                    // ✅ Updated
```

### 3. Documentation Updates
```typescript
// Files updated
ESCROW_SRC_README.md           // ✅ Updated with new API
PLU-TS_MIGRATION.md           // ✅ This document
```

## Benefits of Unified Approach

### 1. Simplified Imports
```typescript
// Before: Multiple imports needed
import { FusionEscrowBuilder } from "./builders/escrow-builder";
import { FusionEscrowSrcBuilder } from "./builders/escrow-src-builder";

// After: Single import handles both
import { FusionEscrowBuilder } from "./builders/escrow-builder";
```

### 2. Code Reuse
- Shared utility functions between source and destination escrow
- Consistent error handling and validation
- Unified configuration and network handling

### 3. Maintenance Benefits
- Single file to maintain instead of two separate builders
- Consistent API patterns across all escrow operations
- Easier to ensure feature parity between source and destination

### 4. Type Safety
- Consistent TypeScript types across all operations
- Better IntelliSense and autocompletion
- Reduced chance of type mismatches

## Migration Checklist

### ✅ Completed
- [x] Remove lucid-cardano dependency from package.json
- [x] Update all PLU-TS imports in builder files
- [x] Combine escrow-builder.ts and escrow-src-builder.ts
- [x] Update index.ts exports
- [x] Add backward compatibility methods
- [x] Update README documentation
- [x] Create migration documentation

### ⚠️ Pending (API Dependent)
- [ ] Implement actual PLU-TS functions once APIs are stable
- [ ] Replace placeholder implementations with real PLU-TS calls
- [ ] Add proper Blockfrost integration using @harmoniclabs/blockfrost-pluts
- [ ] Rewrite test files for new unified API
- [ ] Validate all transaction building functionality

### 🔄 Future Considerations
- [ ] Monitor PLU-TS updates for new offchain capabilities
- [ ] Consider performance optimizations as PLU-TS matures
- [ ] Evaluate integration with other Harmonic Labs tools
- [ ] Implement caching strategies for Blockfrost queries

## Usage Examples After Migration

### Complete Source Escrow Flow
```typescript
import { FusionEscrowBuilder } from "./builders/escrow-builder";

const builder = new FusionEscrowBuilder("blockfrost_project_id", 0);

// 1. Deploy source escrow
const deployTx = await builder.deploySourceEscrow({
  maker: "addr_test1...",
  taker: "addr_test1...",
  resolver: "addr_test1...",
  amount: 1000000n,
  secret_hash: "deadbeef...",
  finality_time: Date.now() / 1000 + 600,
  private_cancel_time: Date.now() / 1000 + 3600,
  public_cancel_time: Date.now() / 1000 + 7200,
  deposit_lovelace: 2000000n,
  order_hash: "fusion_order_hash",
  fill_id: 1
});

// 2. Submit deployment transaction
// ... transaction submission logic

// 3. Taker withdraws with secret
const withdrawTx = await builder.withdrawFromSource({
  escrowUtxo: escrowUtxo,
  secret: "secret_preimage",
  amount: 1000000n,
  taker_address: "addr_test1..."
});
```

### Complete Destination Escrow Flow
```typescript
// 1. Deploy destination escrow
const deployTx = await builder.deployDestinationEscrow({
  maker: "addr_test1...",
  resolver: "addr_test1...",
  beneficiary: "addr_test1...",
  amount: 1000000n,
  secret_hash: "deadbeef...",
  user_deadline: Date.now() / 1000 + 3600,
  cancel_after: Date.now() / 1000 + 7200,
  deposit_lovelace: 2000000n,
  order_hash: "fusion_order_hash",
  fill_id: 1
});

// 2. Beneficiary withdraws
const withdrawTx = await builder.withdrawFromDestination({
  escrowUtxo: escrowUtxo,
  secret: "secret_preimage",
  amount: 1000000n,
  beneficiary_address: "addr_test1..."
});
```

This unified approach provides a consistent, maintainable foundation for CardanoSwap+ Fusion validator operations while preparing for future PLU-TS API stabilization.