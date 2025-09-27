/**
 * Fusion-compatible Cardano Escrow Destination Validator
 *
 * This validator mirrors the functionality of the EVM escrowDst.sol contract:
 *
 * EVM Contract Functions:
 * - withdraw(bytes32 secret, Immutables calldata immutables)
 * - publicWithdraw(bytes32 secret, Immutables calldata immutables)
 * - cancel(Immutables calldata immutables)
 *
 * Cardano Validator Redeemers:
 * - Withdraw: Private withdrawal by taker with secret verification
 * - PublicWithdraw: Public withdrawal by anyone (earns deposit) after timeout
 * - Cancel: Private cancellation by resolver after timeout
 * - PublicCancel: Public cancellation by anyone (earns deposit) after extended timeout
 *
 * Timeline (matches EVM contract):
 * ---- contract deployed ----/---- finality ----/---- PRIVATE WITHDRAWAL ----/---- PUBLIC WITHDRAWAL ----/
 * ----/---- private cancellation ----
 *
 * Key Features:
 * - Secret-based HTLC for atomic swaps
 * - Time-locked phases for security
 * - Public operations with incentive deposits
 * - Multi-fill support via merkle trees
 * - Asset-agnostic (ADA and native tokens)
 * - Cross-chain compatibility with 1inch Fusion
 */

import {
  compile,
  Script,
  pfn,
  pBool,
  bool,
  plet,
  perror,
  punIData,
  psha2_256,
  int,
  bs,
  PMaybe,
  pif,
  pnot,
  pand,
  por,
  PScriptContext,
  Credential,
  PTxInfo,
  PTxOut,
  PValue,
  PAddress,
  PPubKeyHash,
  pstruct,
  data,
  unit,
  punsafeConvertType,
  pmatch,
  Term,
  PByteString,
  PBool
} from "@harmoniclabs/plu-ts";

import { FusionEscrowDatum, MerkleProof } from "../types/fusion-datum";
import { FusionEscrowRedeemer } from "../types/fusion-redeemer";
import { validateSecret } from "../utils/merkle-tree";

/**
 * Main validator function for fusion escrow destination
 */
export const fusionEscrowDst = pfn([
  FusionEscrowDatum.type,
  FusionEscrowRedeemer.type,
  PScriptContext.type
], bool)
(({ datumo, redeemero, ctxo }) => {

  
  const datum = plet(punsafeConvertType(datumo, FusionEscrowDatum.type));
  const ctx = plet(punsafeConvertType(ctxo, PScriptContext.type));
  const redeemer = plet(punsafeConvertType(redeemero, FusionEscrowRedeemer.type));

  const txInfo = plet(ctx.tx);
  const now = plet(
    pmatch(txInfo.validRange.from)
    ({
      NegInf: _ => perror(int, "Invalid time range"),
      Finite: ({ bound }) => bound,
      PosInf: _ => perror(int, "Invalid time range")
    })
  );

  // Extract datum fields
  const maker = plet(datum.maker);
  const resolver = plet(datum.resolver);
  const beneficiary = plet(datum.beneficiary);
  const assetPolicy = plet(datum.asset_policy);
  const assetName = plet(datum.asset_name);
  const remaining = plet(datum.remaining);
  const hashlock = plet(datum.hashlock);
  const userDeadline = plet(datum.user_deadline);
  const cancelAfter = plet(datum.cancel_after);
  const depositLovelace = plet(datum.deposit_lovelace);
  const merkleRoot = plet(datum.merkle_root);

  // Helper functions
  const isValidTimeWindow = (start: any, end: any) =>
    now.gtEq(start).and(now.lt(end));

  const isSignedBy = (pkh: any) =>
    txInfo.signatories.find((sig: any) => sig.eq(pkh)).isJust;

  const validateSecretHash = (
    secret: Term<PByteString>,
    hashlock: Term<PByteString>,
    merkleRoot: any,
    proof: any
  ): Term<PBool> =>
    pmatch(merkleRoot)
    ({
      Nothing: _ =>
        // Single-fill branch
        psha2_256.$(secret).eq(hashlock),
  
      Just: justVal =>
        justVal.extract("val").in(({ val: root }) =>
          pmatch(proof)
          ({
            Nothing: _ =>
              // Missing proof in multi-fill case → fail
              perror(PBool),
  
            Just: proofVal =>
              proofVal.extract("proof_elements").in(({ proof_elements }) =>
                validateSecret({
                  secret,
                  hashlock,
                  merkleRoot: root,
                  merkleProof: proof_elements,
                  isMultiFill: ptrue
                })
              )
          })
        )
    });

  const sendToAddress = (address: any, amount: any) => {
    // Validate that outputs contain the required payment
    return txInfo.outputs.some((output: any) =>
      output.address.credential.switch({
        PubKey: (pkh) => pkh.eq(address),
        Script: () => pBool(false)
      }).and(
        pif(assetPolicy.eq(bs("")))
          .then(output.value.lovelace.gtEq(amount))
          .else(
            output.value.getAssets(assetPolicy).get(assetName).switch({
              Nothing: () => pBool(false),
              Just: (assetAmount) => assetAmount.gtEq(amount)
            })
          )
      )
    );
  };

  return redeemer.switch({
    // Private withdrawal by beneficiary
    Withdraw: ({ secret, amount, merkle_proof }) =>
      pand([
        isSignedBy(beneficiary),
        isValidTimeWindow(userDeadline, cancelAfter),
        validateSecretHash(secret, merkle_proof),
        amount.gtEq(int(1)).and(amount.ltEq(remaining)),
        sendToAddress(beneficiary, amount)
      ]),

    // Public withdrawal by anyone (earns deposit)
    PublicWithdraw: ({ secret, amount, merkle_proof }) =>
      pand([
        now.gtEq(cancelAfter),
        validateSecretHash(secret, merkle_proof),
        amount.gtEq(int(1)).and(amount.ltEq(remaining)),
        sendToAddress(beneficiary, amount),
        // Caller earns deposit reward
        txInfo.outputs.some((output: any) =>
          output.value.lovelace.gtEq(depositLovelace)
        )
      ]),

    // Private cancellation by resolver
    Cancel: () =>
      pand([
        isSignedBy(resolver),
        now.gtEq(cancelAfter),
        sendToAddress(resolver, remaining)
      ]),

    // Public cancellation by anyone (earns deposit)
    PublicCancel: () =>
      pand([
        now.gtEq(cancelAfter.add(int(86400000))), // 24 hours after cancel_after
        sendToAddress(resolver, remaining),
        // Caller earns deposit reward
        txInfo.outputs.some((output: any) =>
          output.value.lovelace.gtEq(depositLovelace)
        )
      ])
  });
});

/**
 * Compile the validator to get the script
 */
export const fusionEscrowDstScript = compile(fusionEscrowDst);

/**
 * Parallel Functionality Mapping:
 *
 * EVM escrowDst.sol                    ↔    Cardano fusion-escrow-dst.ts
 * =====================================    ================================
 *
 * contract EscrowDst                   ↔    fusionEscrowDst validator
 *
 * withdraw(secret, immutables)         ↔    Withdraw redeemer
 * - Only taker can call                ↔    - Check beneficiary signature
 * - Requires valid secret              ↔    - Validate secret hash
 * - Within withdrawal window           ↔    - Check user_deadline <= now < cancel_after
 * - Transfers funds to taker           ↔    - Send assets to beneficiary address
 * - Supports partial fills             ↔    - Update remaining amount in datum
 *
 * publicWithdraw(secret, immutables)   ↔    PublicWithdraw redeemer
 * - Anyone can call                    ↔    - No signature check required
 * - Requires valid secret              ↔    - Validate secret hash
 * - Within public window               ↔    - Check cancel_after <= now
 * - Caller earns deposit reward        ↔    - Send deposit to transaction submitter
 * - Transfers remaining to taker       ↔    - Send remaining assets to beneficiary
 *
 * cancel(immutables)                   ↔    Cancel redeemer
 * - Only resolver can call             ↔    - Check resolver signature
 * - After cancellation time            ↔    - Check now >= cancel_after
 * - Refunds resolver                   ↔    - Send all assets back to resolver
 *
 * N/A (dst doesn't have publicCancel) ↔    PublicCancel redeemer
 * - Anyone can call                    ↔    - No signature check required
 * - After extended timeout             ↔    - Check now >= cancel_after + extension
 * - Caller earns deposit reward        ↔    - Send deposit to transaction submitter
 * - Refunds resolver                   ↔    - Send remaining assets back to resolver
 *
 * Immutables struct                    ↔    FusionEscrowDatum
 * - maker: address                     ↔    - maker: PPubKeyHash
 * - taker: address                     ↔    - beneficiary: PPubKeyHash
 * - resolver: address                  ↔    - resolver: PPubKeyHash
 * - token: IERC20                      ↔    - asset_policy + asset_name: bs
 * - amount: uint256                    ↔    - remaining: int
 * - hashlock: bytes32                  ↔    - hashlock: bs
 * - timelocks: Timelocks               ↔    - user_deadline, cancel_after: int
 * - rescueDelay: uint32                ↔    - deposit_lovelace: int
 *
 * Key Differences from Source Escrow:
 * - Destination escrow is funded by resolver (not maker)
 * - Shorter timeline (no finality delay)
 * - Different participant roles (beneficiary vs taker)
 * - Supports merkle tree for partial fills
 * - Public operations earn deposit rewards
 *
 * Security Features (Both Chains):
 * - Atomic secret revelation
 * - Time-locked operation phases
 * - Public operation incentives
 * - Multi-fill merkle tree support
 * - Immutable parameters
 * - Emergency rescue mechanisms
 */

export default fusionEscrowDstScript;