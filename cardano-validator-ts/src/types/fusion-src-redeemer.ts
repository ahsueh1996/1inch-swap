import { pstruct, bs, int, PMaybe, list, PPubKeyHash } from "@harmoniclabs/plu-ts";
import { MerkleProof } from "./fusion-datum";

/**
 * Fusion-compatible Redeemer for source escrow operations
 * Mirrors the functionality of EVM escrowSrc.sol contract
 *
 * Timeline phases:
 * ---- contract deployed ----/---- finality ----/---- PRIVATE WITHDRAWAL ----/---- PUBLIC WITHDRAWAL ----/
 * ----/---- private cancellation ----/---- public cancellation ----
 */
export const FusionEscrowSrcRedeemer = pstruct({
  // Private withdrawal: Only taker can withdraw with secret during withdrawal period
  // Maps to withdraw() and withdrawTo() functions in EVM contract
  Withdraw: {
    secret: bs,                                    // The secret that hashes to hashlock
    amount: int,                                   // Amount to withdraw (≤ remaining)
    merkle_proof: PMaybe(MerkleProof.type).type   // Merkle proof for partial fills (if multi-fill)
  },

  // Public withdrawal: Anyone can withdraw with secret after public period starts, earns deposit
  // Maps to publicWithdraw() function in EVM contract
  PublicWithdraw: {
    secret: bs,                                    // The secret that hashes to hashlock
    amount: int,                                   // Amount to withdraw (≤ remaining)
    merkle_proof: PMaybe(MerkleProof.type).type   // Merkle proof for partial fills (if multi-fill)
  },

  // Private cancellation: Only maker can cancel after timeout and get refund
  // Maps to cancel() function in EVM contract
  Cancel: {},

  // Public cancellation: Anyone can cancel after extended timeout, earns deposit
  // Maps to publicCancel() function in EVM contract
  PublicCancel: {}
});

/**
 * Extended redeemer for source escrow with withdrawal target specification
 * Mirrors EVM withdrawTo() functionality
 */
export const FusionEscrowSrcExtendedRedeemer = pstruct({
  // Withdraw to specific address (taker can specify different target)
  // Maps to withdrawTo() function in EVM contract
  WithdrawTo: {
    secret: bs,                                    // The secret that hashes to hashlock
    amount: int,                                   // Amount to withdraw (≤ remaining)
    target: PPubKeyHash.type,                      // Target address (as pubkey hash)
    merkle_proof: PMaybe(MerkleProof.type).type   // Merkle proof for partial fills
  },

  // Standard operations (same as basic redeemer)
  Withdraw: {
    secret: bs,
    amount: int,
    merkle_proof: PMaybe(MerkleProof.type).type
  },

  PublicWithdraw: {
    secret: bs,
    amount: int,
    merkle_proof: PMaybe(MerkleProof.type).type
  },

  Cancel: {},

  PublicCancel: {}
});

/**
 * Source escrow datum extensions for initialization
 * Additional fields needed for source escrow deployment
 */
export const FusionEscrowSrcDatum = pstruct({
  FusionEscrowSrcDatum: {
    // Core participants (same as base datum)
    maker: PPubKeyHash.type,           // User who created and funded the escrow
    resolver: PPubKeyHash.type,        // Resolver who will handle cross-chain verification
    beneficiary: PPubKeyHash.type,     // Taker who can withdraw with secret

    // Asset details
    asset_policy: bs,                  // PolicyID of native token (empty for ADA)
    asset_name: bs,                    // AssetName (empty for ADA)
    remaining: int,                    // Remaining amount to be withdrawn
    initial_amount: int,               // Original deposited amount (for tracking)

    // HTLC parameters
    hashlock: bs,                      // SHA-256 hash of secret (single fill)
    user_deadline: int,                // Deadline for private withdrawal (POSIX timestamp)
    public_deadline: int,              // Deadline for public withdrawal (POSIX timestamp)
    cancel_after: int,                 // Deadline for cancellation (POSIX timestamp)
    deposit_lovelace: int,             // Safety deposit for public operations

    // Fusion multi-fill support
    merkle_root: PMaybe(bs).type,      // Merkle root for multiple secrets (None for single fill)

    // Order metadata
    order_hash: bs,                    // 1inch Fusion order hash for tracking
    fill_id: int,                      // Unique fill ID for this escrow instance

    // Source-specific fields
    finality_blocks: int,              // Number of blocks to wait for finality
    deployed_at_block: int             // Block number when escrow was deployed
  }
});

export type FusionEscrowSrcRedeemerType = typeof FusionEscrowSrcRedeemer.type;
export type FusionEscrowSrcExtendedRedeemerType = typeof FusionEscrowSrcExtendedRedeemer.type;
export type FusionEscrowSrcDatumType = typeof FusionEscrowSrcDatum.type;