import {
  Address,
  compile,
  Credential,
  pfn,
  Script,
  psha2_256,
  ptraceIfFalse,
  pdelay,
  pStr,
  ScriptType,
  PScriptContext,
  unit,
  passert,
  plet,
  pmatch,
  perror,
  PMaybe,
  data,
  punsafeConvertType,
  pBool,
  bool,
  int,
  bs,
  POutputDatum,
  PPubKeyHash,
  list
} from "@harmoniclabs/plu-ts";

import { FusionEscrowDatum } from "../types/fusion-datum";
import { FusionEscrowSrcRedeemer, FusionEscrowSrcDatum } from "../types/fusion-src-redeemer";
import { validateSecret, verifyMerkleProof } from "../utils/merkle-tree";

/**
 * Fusion-compatible Cardano Escrow Source Validator
 *
 * This validator mirrors the functionality of the EVM escrowSrc.sol contract:
 * - Initial fund locking during contract deployment
 * - Taker withdrawal with secret verification (private and public phases)
 * - Maker cancellation after timeout (private and public phases)
 * - Safety deposits for public operations
 * - Cross-chain atomic swap compatibility
 *
 * Timeline:
 * ---- contract deployed ----/---- finality ----/---- PRIVATE WITHDRAWAL ----/---- PUBLIC WITHDRAWAL ----/
 * ----/---- private cancellation ----/---- public cancellation ----
 */
export const fusionEscrowSrc = pfn([
  FusionEscrowSrcDatum.type,
  FusionEscrowSrcRedeemer.type,
  PScriptContext.type
], bool)
(({ datum, redeemer, ctx }) => {

  // Extract transaction and timing info
  const tx = plet(ctx.tx);
  const currentTime = plet(
    pmatch(tx.interval.from.bound)
      .onPFinite(({ n }) => n)
      ._(_ => perror(int))
  );

  // Helper: Check if asset is ADA
  const isAda = plet(
    datum.asset_policy.length.eq(0).and(datum.asset_name.length.eq(0))
  );

  // Helper: Validate time constraints for source escrow phases
  const afterFinality = plet(currentTime.gtEq(datum.deployed_at_block.plus(datum.finality_blocks)));
  const beforeSrcCancellation = plet(currentTime.lt(datum.cancel_after));
  const afterSrcCancellation = plet(currentTime.gtEq(datum.cancel_after));
  const afterPublicWithdrawal = plet(currentTime.gtEq(datum.public_deadline));

  // Helper: Check if payment goes to specific address (taker for withdrawals)
  const paysToTaker = pfn([int], bool)
  ((amount) => {
    return tx.outputs.some((output: any) => {
      const addressMatches = pmatch(output.address.credential)
        .onPubKey(({ pkh }) => pkh.eq(datum.beneficiary)) // beneficiary is taker in source escrow
        ._(_ => pBool(false));

      const valueMatches = isAda
        ? output.value.lovelace.gtEq(amount)
        : output.value.get(datum.asset_policy).get(datum.asset_name).gtEq(amount);

      return addressMatches.and(valueMatches);
    });
  });

  // Helper: Check if payment goes to maker for cancellations
  const paysToMaker = pfn([int], bool)
  ((amount) => {
    return tx.outputs.some((output: any) => {
      const addressMatches = pmatch(output.address.credential)
        .onPubKey(({ pkh }) => pkh.eq(datum.maker))
        ._(_ => pBool(false));

      const valueMatches = isAda
        ? output.value.lovelace.gtEq(amount)
        : output.value.get(datum.asset_policy).get(datum.asset_name).gtEq(amount);

      return addressMatches.and(valueMatches);
    });
  });

  // Helper: Check if deposit is paid to transaction signer (for public operations)
  const depositPaidToSigner = plet(
    tx.outputs.some((output: any) => {
      const signerPkh = tx.signatories.head;

      const addressMatches = pmatch(output.address.credential)
        .onPubKey(({ pkh }) => pkh.eq(signerPkh))
        ._(_ => pBool(false));

      const depositMatches = output.value.lovelace.gtEq(datum.deposit_lovelace);

      return addressMatches.and(depositMatches);
    })
  );

  // Helper: Validate script continuation for partial withdrawals
  const scriptContinuation = pfn([int], bool)
  ((newRemaining) => {
    return pmatch(newRemaining.eq(0))
      .onTrue(_ => {
        // Complete withdrawal - no script output required
        const scriptOutputs = tx.outputs.filter((output: any) =>
          pmatch(output.address.credential)
            .onScript(({ hash }) => hash.eq(ctx.ownHash))
            ._(_ => pBool(false))
        );
        return scriptOutputs.length.eq(0);
      })
      .onFalse(_ => {
        // Partial withdrawal - require exactly one script output with updated datum
        const scriptOutputs = tx.outputs.filter((output: any) =>
          pmatch(output.address.credential)
            .onScript(({ hash }) => hash.eq(ctx.ownHash))
            ._(_ => pBool(false))
        );

        return pmatch(scriptOutputs.length.eq(1))
          .onTrue(_ => {
            const scriptOutput = scriptOutputs.head;
            const outputDatum = pmatch(scriptOutput.datum)
              .onInlineDatum(({ datum: inlineDatum }) =>
                punsafeConvertType(inlineDatum, FusionEscrowDatum.type)
              )
              ._(_ => perror(FusionEscrowDatum.type));

            // Verify datum is updated correctly (remaining amount decreased)
            const datumValid = outputDatum.maker.eq(datum.maker)
              .and(outputDatum.resolver.eq(datum.resolver))
              .and(outputDatum.beneficiary.eq(datum.beneficiary))
              .and(outputDatum.asset_policy.eq(datum.asset_policy))
              .and(outputDatum.asset_name.eq(datum.asset_name))
              .and(outputDatum.remaining.eq(newRemaining))
              .and(outputDatum.hashlock.eq(datum.hashlock))
              .and(outputDatum.user_deadline.eq(datum.user_deadline))
              .and(outputDatum.cancel_after.eq(datum.cancel_after))
              .and(outputDatum.deposit_lovelace.eq(datum.deposit_lovelace))
              .and(outputDatum.order_hash.eq(datum.order_hash))
              .and(outputDatum.fill_id.eq(datum.fill_id));

            return datumValid;
          })
          ._(_ => pBool(false));
      });
  });

  // Helper: Validate secret against hashlock or merkle tree
  const validateSecretHash = pfn([bs, PMaybe(bs).type], bool)
  ((secret, merkleProof) => {
    return pmatch(datum.merkle_root)
      .onNothing(_ => {
        // Single fill: validate against hashlock
        return psha2_256.$(secret).eq(datum.hashlock);
      })
      .onJust(({ val: merkleRoot }) => {
        // Multi-fill: validate against merkle tree
        return pmatch(merkleProof)
          .onNothing(_ => pBool(false))
          .onJust(({ val: proof }) => {
            const secretHash = psha2_256.$(secret);
            return verifyMerkleProof({
              leaf: secretHash,
              proof: proof,
              root: merkleRoot
            });
          });
      });
  });

  // Main validation logic based on EVM escrowSrc.sol
  return pmatch(redeemer)
    .onWithdraw(({ secret, amount, merkle_proof }) => {
      // Private withdrawal phase - only taker can withdraw with valid secret
      // Timeline: ---- finality ----/---- PRIVATE WITHDRAWAL ----/---- public withdrawal ----

      const timeValid = ptraceIfFalse.$(pdelay(pStr("Withdrawal not in private phase")))
        .$(afterFinality.and(beforeSrcCancellation));

      // Only taker (beneficiary) can perform private withdrawal
      const takerValid = ptraceIfFalse.$(pdelay(pStr("Only taker can withdraw")))
        .$(tx.signatories.any((signer: any) => signer.eq(datum.beneficiary)));

      // Secret validation
      const secretValid = ptraceIfFalse.$(pdelay(pStr("Invalid secret")))
        .$(validateSecretHash(secret, merkle_proof));

      // Amount validation
      const amountValid = ptraceIfFalse.$(pdelay(pStr("Invalid withdrawal amount")))
        .$(amount.gt(0).and(amount.ltEq(datum.remaining)));

      // Payment to taker validation
      const paymentValid = ptraceIfFalse.$(pdelay(pStr("Payment to taker missing")))
        .$(paysToTaker(amount));

      // Script continuation validation
      const continuationValid = ptraceIfFalse.$(pdelay(pStr("Invalid script continuation")))
        .$(scriptContinuation(datum.remaining.minus(amount)));

      return timeValid.and(takerValid).and(secretValid).and(amountValid)
        .and(paymentValid).and(continuationValid);
    })

    .onPublicWithdraw(({ secret, amount, merkle_proof }) => {
      // Public withdrawal phase - anyone can withdraw with valid secret, earns deposit
      // Timeline: ---- private withdrawal ----/---- PUBLIC WITHDRAWAL ----/---- cancellation ----

      const timeValid = ptraceIfFalse.$(pdelay(pStr("Public withdrawal not available")))
        .$(afterPublicWithdrawal.and(beforeSrcCancellation));

      // Secret validation (same as private)
      const secretValid = ptraceIfFalse.$(pdelay(pStr("Invalid secret")))
        .$(validateSecretHash(secret, merkle_proof));

      // Amount validation
      const amountValid = ptraceIfFalse.$(pdelay(pStr("Invalid withdrawal amount")))
        .$(amount.gt(0).and(amount.ltEq(datum.remaining)));

      // Payment to taker validation
      const paymentValid = ptraceIfFalse.$(pdelay(pStr("Payment to taker missing")))
        .$(paysToTaker(amount));

      // Script continuation validation
      const continuationValid = ptraceIfFalse.$(pdelay(pStr("Invalid script continuation")))
        .$(scriptContinuation(datum.remaining.minus(amount)));

      // Public operation requires deposit payment to signer
      const depositValid = ptraceIfFalse.$(pdelay(pStr("Deposit not paid to signer")))
        .$(depositPaidToSigner);

      return timeValid.and(secretValid).and(amountValid)
        .and(paymentValid).and(continuationValid).and(depositValid);
    })

    .onCancel(_ => {
      // Private cancellation - only maker (original depositor) can cancel after timeout
      // Timeline: ---- withdrawal phases ----/---- PRIVATE CANCELLATION ----/---- public cancellation ----

      const timeValid = ptraceIfFalse.$(pdelay(pStr("Cancellation too early")))
        .$(afterSrcCancellation);

      // Only maker can perform private cancellation
      const makerValid = ptraceIfFalse.$(pdelay(pStr("Only maker can cancel")))
        .$(tx.signatories.any((signer: any) => signer.eq(datum.maker)));

      // Refund all remaining tokens to maker
      const refundValid = ptraceIfFalse.$(pdelay(pStr("Refund to maker missing")))
        .$(paysToMaker(datum.remaining));

      return timeValid.and(makerValid).and(refundValid);
    })

    .onPublicCancel(_ => {
      // Public cancellation - anyone can cancel after extended timeout, earns deposit
      // Timeline: ---- private cancellation ----/---- PUBLIC CANCELLATION ----

      // Allow public cancellation after a delay beyond private cancellation
      const publicCancelTime = datum.cancel_after.plus(datum.deposit_lovelace); // Using deposit as delay
      const timeValid = ptraceIfFalse.$(pdelay(pStr("Public cancellation too early")))
        .$(currentTime.gtEq(publicCancelTime));

      // Refund all remaining tokens to maker
      const refundValid = ptraceIfFalse.$(pdelay(pStr("Refund to maker missing")))
        .$(paysToMaker(datum.remaining));

      // Public operation requires deposit payment to signer
      const depositValid = ptraceIfFalse.$(pdelay(pStr("Deposit not paid to signer")))
        .$(depositPaidToSigner);

      return timeValid.and(refundValid).and(depositValid);
    });
});

// Compile the validator
export const compiledFusionEscrowSrc = compile(fusionEscrowSrc);

// Create script instance
export const fusionEscrowSrcScript = new Script(
  ScriptType.PlutusV3,
  compiledFusionEscrowSrc
);

// Generate addresses
export const fusionEscrowSrcMainnetAddr = new Address(
  "mainnet",
  Credential.script(fusionEscrowSrcScript.hash)
);

export const fusionEscrowSrcTestnetAddr = new Address(
  "testnet",
  Credential.script(fusionEscrowSrcScript.hash.clone())
);