import { bs, plet, pfn, psha2_256, list, int, pBool, bool, pByteString } from "@harmoniclabs/plu-ts";

/**
 * Merkle tree utilities for partial fill validation
 * Compatible with 1inch Fusion's multi-secret approach
 */

/**
 * Validates a merkle proof on-chain
 */
export const verifyMerkleProof = pfn([
  bs,           // leaf (hashed secret)
  list(bs).type, // proof elements
  bs            // merkle root
], bool)
(({ leaf, proof, root }) => {
  // Compute merkle root from leaf and proof
  const computedRoot = plet(
    proof.foldr(
      leaf,
      (proofElem: any, currentHash: any) =>
        psha2_256.$(currentHash.concat(proofElem))
    )
  );

  return computedRoot.eq(root);
});

/**
 * Validates secret against either single hashlock or merkle tree
 */
export const validateSecret = pfn([
  bs,                    // secret
  bs,                    // hashlock (for single fill)
  bs,                    // merkle_root (optional, for multi-fill)
  list(bs).type,         // merkle_proof (required if merkle_root provided)
  bool                   // is_multi_fill flag
], bool)
(({ secret, hashlock, merkleRoot, merkleProof, isMultiFill }) => {
  const secretHash = plet(psha2_256.$(secret));

  return plet(
    isMultiFill
      ? verifyMerkleProof({ leaf: secretHash, proof: merkleProof, root: merkleRoot })
      : secretHash.eq(hashlock)
  );
});

/**
 * Helper to hash a secret for merkle leaf
 */
export const hashSecretForMerkle = pfn([bs], bs)
((secret) => psha2_256.$(secret));

/**
 * Validates merkle tree index bounds
 */
export const validateMerkleIndex = pfn([
  int,  // leaf_index
  int   // max_index (tree size - 1)
], bool)
(({ leafIndex, maxIndex }) => {
  return leafIndex.gtEq(0).and(leafIndex.ltEq(maxIndex));
});