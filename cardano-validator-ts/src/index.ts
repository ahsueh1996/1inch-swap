/**
 * CardanoSwap+ Fusion TypeScript Validators
 *
 * This package provides TypeScript implementations of Cardano validators
 * compatible with 1inch Fusion's cross-chain swap infrastructure.
 *
 * Features:
 * - Single and multiple fill support via merkle trees
 * - Asset-agnostic (ADA and native tokens)
 * - Time-locked operations with public finalization
 * - Safety deposits for public operations
 * - Integration with 1inch Fusion SDK
 */

export * from "./types/fusion-datum";
export * from "./types/fusion-redeemer";
export * from "./types/fusion-src-redeemer";
export * from "./validators/fusion-escrow-dst";
export * from "./validators/fusion-escrow-src";
export * from "./builders/escrow-builder";
export * from "./builders/escrow-src-builder";
export * from "./builders/fusion-integration";
export * from "./utils/merkle-tree";

// Main exports for easy integration
export {
  FusionEscrowDatum,
  MerkleProof,
  AssetInfo
} from "./types/fusion-datum";

export {
  FusionEscrowRedeemer,
  FusionFactoryRedeemer
} from "./types/fusion-redeemer";

export {
  FusionEscrowSrcRedeemer,
  FusionEscrowSrcDatum
} from "./types/fusion-src-redeemer";

export {
  fusionEscrowDst,
  fusionEscrowDstScript
} from "./validators/fusion-escrow-dst";

export {
  fusionEscrowSrc,
  fusionEscrowSrcScript
} from "./validators/fusion-escrow-src";

export { FusionEscrowBuilder } from "./builders/escrow-builder";
export { FusionEscrowSrcBuilder } from "./builders/escrow-src-builder";
export { FusionCardanoIntegration } from "./builders/fusion-integration";

// Utility functions
export {
  verifyMerkleProof,
  validateSecret,
  hashSecretForMerkle,
  validateMerkleIndex
} from "./utils/merkle-tree";