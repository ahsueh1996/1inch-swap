import { pstruct, bs, int, PMaybe, list } from "@harmoniclabs/plu-ts";
import { MerkleProof } from "./fusion-datum";

/**
 * Fusion-compatible Redeemer for destination escrow operations
 * Supports partial fills and public finalization
 */
export const FusionEscrowRedeemer = pstruct({
  // User withdraws funds with secret (resolver or maker can call)
  Withdraw: {
    secret: bs,                                    // The secret that hashes to hashlock
    amount: int,                                   // Amount to withdraw (≤ remaining)
    merkle_proof: PMaybe(MerkleProof.type).type   // Merkle proof for partial fills
  },

  // Public withdrawal after timeout (anyone can call, earns deposit)
  PublicWithdraw: {
    secret: bs,                                    // The secret that hashes to hashlock
    amount: int,                                   // Amount to withdraw (≤ remaining)
    merkle_proof: PMaybe(MerkleProof.type).type   // Merkle proof for partial fills
  },

  // Resolver cancels after timeout and claims refund
  Cancel: {},

  // Public cancellation after extended timeout (anyone can call, earns deposit)
  PublicCancel: {}
});

/**
 * Additional redeemer for escrow factory operations
 */
export const FusionFactoryRedeemer = pstruct({
  // Deploy new escrow instance
  Deploy: {
    order_hash: bs,                    // 1inch Fusion order hash
    fill_amount: int,                  // Amount being filled in this instance
    secret_hash: bs                    // Hash of secret for this fill
  },

  // Update existing escrow for partial fill
  PartialFill: {
    new_remaining: int,                // Updated remaining amount
    next_secret_index: int             // Next secret index in merkle tree
  }
});

export type FusionEscrowRedeemerType = typeof FusionEscrowRedeemer.type;
export type FusionFactoryRedeemerType = typeof FusionFactoryRedeemer.type;