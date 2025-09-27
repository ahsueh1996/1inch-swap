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
import { FusionEscrowRedeemer } from "../types/fusion-redeemer";
import { validateSecret, verifyMerkleProof } from "../utils/merkle-tree";

/**
 * Fusion-compatible Cardano Escrow Destination Validator
 *
 * Features:
 * - Single and multiple fill support via merkle trees
 * - Time-locked operations with public finalization
 * - Asset-agnostic (ADA and native tokens)
 * - Partial withdrawal with UTXO recreation
 * - Safety deposits for public operations
 * - Compatible with 1inch Fusion cross-chain infrastructure
 */
export const fusionEscrowDst = pfn([
  FusionEscrowDatum.type,
  FusionEscrowRedeemer.type,
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

  // Helper: Validate time constraints
  const beforeUserDeadline = plet(
    pmatch(tx.interval.to.bound)
      .onPFinite(({ n: upperBound }) => upperBound.ltEq(datum.user_deadline))
      ._(_ => pBool(false))
  );

  const afterCancelDeadline = plet(
    pmatch(tx.interval.from.bound)
      .onPFinite(({ n: lowerBound }) => lowerBound.gtEq(datum.cancel_after))
      ._(_ => pBool(false))
  );

  // Helper: Check if payment goes to specific pubkey hash
  const paysToAddress = pfn([PPubKeyHash.type, int], bool)
  ((pkh, amount) => {
    return tx.outputs.some((output: any) => {
      const addressMatches = pmatch(output.address.credential)
        .onPubKey(({ pkh: outputPkh }) => outputPkh.eq(pkh))
        ._(_ => pBool(false));

      const valueMatches = isAda
        ? output.value.lovelace.gtEq(amount)
        : output.value.get(datum.asset_policy).get(datum.asset_name).gtEq(amount);

      return addressMatches.and(valueMatches);
    });
  });

  // Helper: Check if deposit is paid to transaction signer
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

  // Helper: Validate script continuation for partial fills
  const scriptContinuation = pfn([int], bool)
  ((newRemaining) => {
    return pmatch(newRemaining.eq(0))
      .onTrue(_ => {
        // Complete fill - no script output required
        const scriptOutputs = tx.outputs.filter((output: any) =>
          pmatch(output.address.credential)
            .onScript(({ hash }) => hash.eq(ctx.ownHash))
            ._(_ => pBool(false))
        );
        return scriptOutputs.length.eq(0);
      })
      .onFalse(_ => {
        // Partial fill - require exactly one script output with updated datum
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

            // Verify datum is updated correctly
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

  // Main validation logic
  return pmatch(redeemer)
    .onWithdraw(({ secret, amount, merkle_proof }) => {

      // Time validation
      const timeValid = ptraceIfFalse.$(pdelay(pStr("Withdrawal too late")))
        .$(beforeUserDeadline);

      // Secret validation (single or multi-fill)
      const secretValid = pmatch(datum.merkle_root)
        .onNothing(_ => {
          // Single fill: validate against hashlock
          return ptraceIfFalse.$(pdelay(pStr("Invalid secret")))
            .$(psha2_256.$(secret).eq(datum.hashlock));
        })
        .onJust(({ val: merkleRoot }) => {
          // Multi-fill: validate against merkle tree
          return pmatch(merkle_proof)
            .onNothing(_ => {
              return ptraceIfFalse.$(pdelay(pStr("Merkle proof required for multi-fill")))
                .$(pBool(false));
            })
            .onJust(({ val: proof }) => {
              const secretHash = psha2_256.$(secret);
              return ptraceIfFalse.$(pdelay(pStr("Invalid merkle proof")))
                .$(verifyMerkleProof({
                  leaf: secretHash,
                  proof: proof.proof_elements,
                  root: merkleRoot
                }));
            });
        });

      // Amount validation
      const amountValid = ptraceIfFalse.$(pdelay(pStr("Invalid amount")))
        .$(amount.gt(0).and(amount.ltEq(datum.remaining)));

      // Payment validation
      const paymentValid = ptraceIfFalse.$(pdelay(pStr("Payment missing")))
        .$(paysToAddress(datum.beneficiary, amount));

      // Script continuation validation
      const continuationValid = ptraceIfFalse.$(pdelay(pStr("Invalid script continuation")))
        .$(scriptContinuation(datum.remaining.minus(amount)));

      return timeValid.and(secretValid).and(amountValid).and(paymentValid).and(continuationValid);
    })

    .onPublicWithdraw(({ secret, amount, merkle_proof }) => {

      // Same validations as Withdraw plus deposit requirement
      const timeValid = ptraceIfFalse.$(pdelay(pStr("Public withdrawal too late")))
        .$(beforeUserDeadline);

      const secretValid = pmatch(datum.merkle_root)
        .onNothing(_ =>
          ptraceIfFalse.$(pdelay(pStr("Invalid secret")))
            .$(psha2_256.$(secret).eq(datum.hashlock))
        )
        .onJust(({ val: merkleRoot }) =>
          pmatch(merkle_proof)
            .onNothing(_ => pBool(false))
            .onJust(({ val: proof }) => {
              const secretHash = psha2_256.$(secret);
              return verifyMerkleProof({
                leaf: secretHash,
                proof: proof.proof_elements,
                root: merkleRoot
              });
            })
        );

      const amountValid = amount.gt(0).and(amount.ltEq(datum.remaining));
      const paymentValid = paysToAddress(datum.beneficiary, amount);
      const continuationValid = scriptContinuation(datum.remaining.minus(amount));

      // Public operation requires deposit payment to signer
      const depositValid = ptraceIfFalse.$(pdelay(pStr("Deposit not paid to signer")))
        .$(depositPaidToSigner);

      return timeValid.and(secretValid).and(amountValid)
        .and(paymentValid).and(continuationValid).and(depositValid);
    })

    .onCancel(_ => {

      // Cancel: resolver gets refund after timeout
      const timeValid = ptraceIfFalse.$(pdelay(pStr("Cancel too early")))
        .$(afterCancelDeadline);

      const refundValid = ptraceIfFalse.$(pdelay(pStr("Refund payment missing")))
        .$(paysToAddress(datum.resolver, datum.remaining));

      return timeValid.and(refundValid);
    })

    .onPublicCancel(_ => {

      // Public cancel: anyone can trigger, gets deposit reward
      const timeValid = ptraceIfFalse.$(pdelay(pStr("Public cancel too early")))
        .$(afterCancelDeadline);

      const refundValid = ptraceIfFalse.$(pdelay(pStr("Refund payment missing")))
        .$(paysToAddress(datum.resolver, datum.remaining));

      const depositValid = ptraceIfFalse.$(pdelay(pStr("Deposit not paid to signer")))
        .$(depositPaidToSigner);

      return timeValid.and(refundValid).and(depositValid);
    });
});

// Compile the validator
export const compiledFusionEscrowDst = compile(fusionEscrowDst);

// Create script instance
export const fusionEscrowDstScript = new Script(
  ScriptType.PlutusV3,
  compiledFusionEscrowDst
);

// Generate addresses
export const fusionEscrowDstMainnetAddr = new Address(
  "mainnet",
  Credential.script(fusionEscrowDstScript.hash)
);

export const fusionEscrowDstTestnetAddr = new Address(
  "testnet",
  Credential.script(fusionEscrowDstScript.hash.clone())
);