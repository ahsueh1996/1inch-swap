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

import { MerkleProof } from "../types/fusion-datum";
import {
  FusionEscrowSrcExtendedRedeemer,
  FusionEscrowSrcDatum
} from "../types/fusion-src-redeemer";
import { validateSecret, verifyMerkleProof } from "../utils/merkle-tree";

/**
 * Extended Fusion-compatible Cardano Escrow Source Validator
 *
 * This validator provides full functionality parallel to EVM escrowSrc.sol:
 * - withdraw(): taker withdraws to own address
 * - withdrawTo(): taker withdraws to specified target address
 * - publicWithdraw(): anyone can withdraw after timeout (earns deposit)
 * - cancel(): maker cancels and gets refund after timeout
 * - publicCancel(): anyone can cancel after extended timeout (earns deposit)
 *
 * Timeline phases (matching EVM contract):
 * ---- contract deployed ----/---- finality ----/---- PRIVATE WITHDRAWAL ----/---- PUBLIC WITHDRAWAL ----/
 * ----/---- private cancellation ----/---- public cancellation ----
 */
export const fusionEscrowSrcExtended = pfn([
  FusionEscrowSrcDatum.type,
  FusionEscrowSrcExtendedRedeemer.type,
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

  // Helper: Check if payment goes to specific pubkey hash
  const paysToAddress = pfn([PPubKeyHash.type, int], bool)
  ((targetPkh, amount) => {
    return tx.outputs.some((output: any) => {
      const addressMatches = pmatch(output.address.credential)
        .onPubKey(({ pkh }) => pkh.eq(targetPkh))
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
                punsafeConvertType(inlineDatum, FusionEscrowSrcDatum.type)
              )
              ._(_ => perror(FusionEscrowSrcDatum.type));

            // Verify datum is updated correctly (remaining amount decreased)
            const datumValid = outputDatum.maker.eq(datum.maker)
              .and(outputDatum.resolver.eq(datum.resolver))
              .and(outputDatum.beneficiary.eq(datum.beneficiary))
              .and(outputDatum.asset_policy.eq(datum.asset_policy))
              .and(outputDatum.asset_name.eq(datum.asset_name))
              .and(outputDatum.remaining.eq(newRemaining))
              .and(outputDatum.hashlock.eq(datum.hashlock))
              .and(outputDatum.user_deadline.eq(datum.user_deadline))
              .and(outputDatum.public_deadline.eq(datum.public_deadline))
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
  const validateSecretHash = pfn([bs, PMaybe(MerkleProof.type).type], bool)
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
              proof: proof.proof_elements,
              root: merkleRoot
            });
          });
      });
  });

  // Main validation logic based on EVM escrowSrc.sol
  return pmatch(redeemer)
    .onWithdraw(({ secret, amount, merkle_proof }) => {
      // Private withdrawal phase - only taker can withdraw to their own address
      // Maps to withdraw() function in EVM contract

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

      // Payment to taker validation (withdraw to own address)
      const paymentValid = ptraceIfFalse.$(pdelay(pStr("Payment to taker missing")))
        .$(paysToAddress(datum.beneficiary, amount));

      // Script continuation validation
      const continuationValid = ptraceIfFalse.$(pdelay(pStr("Invalid script continuation")))
        .$(scriptContinuation(datum.remaining.minus(amount)));

      return timeValid.and(takerValid).and(secretValid).and(amountValid)
        .and(paymentValid).and(continuationValid);
    })

    .onWithdrawTo(({ secret, amount, target, merkle_proof }) => {
      // Private withdrawal to specified target - only taker can specify target
      // Maps to withdrawTo() function in EVM contract

      const timeValid = ptraceIfFalse.$(pdelay(pStr("WithdrawTo not in private phase")))
        .$(afterFinality.and(beforeSrcCancellation));

      // Only taker (beneficiary) can perform private withdrawal
      const takerValid = ptraceIfFalse.$(pdelay(pStr("Only taker can withdraw to target")))
        .$(tx.signatories.any((signer: any) => signer.eq(datum.beneficiary)));

      // Secret validation
      const secretValid = ptraceIfFalse.$(pdelay(pStr("Invalid secret")))
        .$(validateSecretHash(secret, merkle_proof));

      // Amount validation
      const amountValid = ptraceIfFalse.$(pdelay(pStr("Invalid withdrawal amount")))
        .$(amount.gt(0).and(amount.ltEq(datum.remaining)));

      // Payment to specified target validation
      const paymentValid = ptraceIfFalse.$(pdelay(pStr("Payment to target missing")))
        .$(paysToAddress(target, amount));

      // Script continuation validation
      const continuationValid = ptraceIfFalse.$(pdelay(pStr("Invalid script continuation")))
        .$(scriptContinuation(datum.remaining.minus(amount)));

      return timeValid.and(takerValid).and(secretValid).and(amountValid)
        .and(paymentValid).and(continuationValid);
    })

    .onPublicWithdraw(({ secret, amount, merkle_proof }) => {
      // Public withdrawal phase - anyone can withdraw with valid secret, earns deposit
      // Maps to publicWithdraw() function in EVM contract

      const timeValid = ptraceIfFalse.$(pdelay(pStr("Public withdrawal not available")))
        .$(afterPublicWithdrawal.and(beforeSrcCancellation));

      // Secret validation (same as private)
      const secretValid = ptraceIfFalse.$(pdelay(pStr("Invalid secret")))
        .$(validateSecretHash(secret, merkle_proof));

      // Amount validation
      const amountValid = ptraceIfFalse.$(pdelay(pStr("Invalid withdrawal amount")))
        .$(amount.gt(0).and(amount.ltEq(datum.remaining)));

      // Payment to taker validation (public withdrawal goes to beneficiary)
      const paymentValid = ptraceIfFalse.$(pdelay(pStr("Payment to taker missing")))
        .$(paysToAddress(datum.beneficiary, amount));

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
      // Private cancellation - only maker can cancel after timeout
      // Maps to cancel() function in EVM contract

      const timeValid = ptraceIfFalse.$(pdelay(pStr("Cancellation too early")))
        .$(afterSrcCancellation);

      // Only maker can perform private cancellation
      const makerValid = ptraceIfFalse.$(pdelay(pStr("Only maker can cancel")))
        .$(tx.signatories.any((signer: any) => signer.eq(datum.maker)));

      // Refund all remaining tokens to maker
      const refundValid = ptraceIfFalse.$(pdelay(pStr("Refund to maker missing")))
        .$(paysToAddress(datum.maker, datum.remaining));

      return timeValid.and(makerValid).and(refundValid);
    })

    .onPublicCancel(_ => {
      // Public cancellation - anyone can cancel after extended timeout, earns deposit
      // Maps to publicCancel() function in EVM contract

      // Allow public cancellation after a delay beyond private cancellation
      const publicCancelTime = datum.cancel_after.plus(datum.deposit_lovelace); // Using deposit as delay
      const timeValid = ptraceIfFalse.$(pdelay(pStr("Public cancellation too early")))
        .$(currentTime.gtEq(publicCancelTime));

      // Refund all remaining tokens to maker
      const refundValid = ptraceIfFalse.$(pdelay(pStr("Refund to maker missing")))
        .$(paysToAddress(datum.maker, datum.remaining));

      // Public operation requires deposit payment to signer
      const depositValid = ptraceIfFalse.$(pdelay(pStr("Deposit not paid to signer")))
        .$(depositPaidToSigner);

      return timeValid.and(refundValid).and(depositValid);
    });
});

// Compile the validator
export const compiledFusionEscrowSrcExtended = compile(fusionEscrowSrcExtended);

// Create script instance
export const fusionEscrowSrcExtendedScript = new Script(
  ScriptType.PlutusV3,
  compiledFusionEscrowSrcExtended
);

// Generate addresses
export const fusionEscrowSrcExtendedMainnetAddr = new Address(
  "mainnet",
  Credential.script(fusionEscrowSrcExtendedScript.hash)
);

export const fusionEscrowSrcExtendedTestnetAddr = new Address(
  "testnet",
  Credential.script(fusionEscrowSrcExtendedScript.hash.clone())
);