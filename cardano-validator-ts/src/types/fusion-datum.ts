import {
  pstruct,
  bs,
  PPubKeyHash,
  int,
  list,
  PMaybe,
  Data,
  StructT
} from "@harmoniclabs/plu-ts";

/**
 * Fusion-compatible Datum for destination escrow on Cardano
 * Supports both single and multiple fill orders via merkle tree
 */
export const FusionEscrowDatum = pstruct({
  FusionEscrowDatum: {
    // Core participants
    maker: PPubKeyHash.type,           // User who created the swap order
    resolver: PPubKeyHash.type,        // Resolver who filled the EVM side
    beneficiary: PPubKeyHash.type,     // Final recipient on Cardano

    // Asset details
    asset_policy: bs,                  // PolicyID of native token (empty for ADA)
    asset_name: bs,                    // AssetName (empty for ADA)
    remaining: int,                    // Remaining amount to be withdrawn

    // HTLC parameters
    hashlock: bs,                      // SHA-256 hash of secret (single fill)
    user_deadline: int,                // Deadline for user withdrawal (POSIX timestamp)
    cancel_after: int,                 // Deadline for cancellation (POSIX timestamp)
    deposit_lovelace: int,             // Safety deposit for public operations

    // Fusion multi-fill support
    merkle_root: PMaybe(bs).type,      // Merkle root for multiple secrets (None for single fill)
    secret_index: int,                 // Current secret index for partial fills
    total_amount: int,                 // Original total amount (for partial fill tracking)

    // Order metadata
    order_hash: bs,                    // 1inch Fusion order hash for tracking
    fill_id: int                       // Unique fill ID for this escrow instance
  }
});

/**
 * Merkle proof structure for partial fill validation
 */
export const MerkleProof = pstruct({
  MerkleProof: {
    leaf_index: int,                   // Index of the secret in merkle tree
    proof_elements: list(bs)           // Merkle proof path
  }
});

/**
 * Asset representation for multi-asset support
 */
export const AssetInfo = pstruct({
  AssetInfo: {
    policy_id: bs,                     // PolicyID (empty for ADA)
    asset_name: bs,                    // AssetName (empty for ADA)
    amount: int                        // Amount of this asset
  }
});

export type FusionEscrowDatumType = StructT<typeof FusionEscrowDatum>;
export type MerkleProofType = StructT<typeof MerkleProof>;
export type AssetInfoType = StructT<typeof AssetInfo>;