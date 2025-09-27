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
  PPubKeyHash,
  list,
  pstruct
} from "@harmoniclabs/plu-ts";

/**
 * Cardano Escrow Datum for cross-chain resolver
 */
export const CardanoEscrowDatum = pstruct({
  CardanoEscrowDatum: {
    maker: PPubKeyHash.type,           // Original order maker
    resolver: PPubKeyHash.type,        // Resolver filling the order
    beneficiary: PPubKeyHash.type,     // Final recipient on Cardano
    asset_policy: bs,                  // Asset policy ID (empty for ADA)
    asset_name: bs,                    // Asset name (empty for ADA)
    amount: int,                       // Total amount in escrow
    hashlock: bs,                      // SHA-256 hash of secret
    user_deadline: int,                // User withdrawal deadline
    cancel_after: int,                 // Cancellation deadline
    deposit_lovelace: int,             // Safety deposit amount
    order_hash: bs,                    // Source order hash
    fill_id: int,                      // Fill instance ID
    src_chain_id: int                  // Source chain identifier
  }
});

/**
 * Cardano Escrow Redeemer
 */
export const CardanoEscrowRedeemer = pstruct({
  // User withdraws with secret
  Withdraw: { secret: bs },
  // Public withdrawal after timeout (earns deposit)
  PublicWithdraw: { secret: bs },
  // Resolver cancels after timeout
  Cancel: {},
  // Public cancellation (earns deposit)
  PublicCancel: {}
});

/**
 * Cardano cross-chain escrow validator
 */
export const cardanoEscrowValidator = pfn([
  CardanoEscrowDatum.type,
  CardanoEscrowRedeemer.type,
  PScriptContext.type
], bool)
(({ datum, redeemer, ctx }) => {

  const tx = plet(ctx.tx);

  // Helper: Check if asset is ADA
  const isAda = plet(
    datum.asset_policy.length.eq(0).and(datum.asset_name.length.eq(0))
  );

  // Helper: Time validation
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

  // Helper: Payment validation
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

  // Helper: Deposit payment to signer
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

  // Main validation logic
  return pmatch(redeemer)
    .onWithdraw(({ secret }) => {
      // Validate secret and timing
      const secretValid = ptraceIfFalse.$(pdelay(pStr("Invalid secret")))
        .$(psha2_256.$(secret).eq(datum.hashlock));

      const timeValid = ptraceIfFalse.$(pdelay(pStr("Withdrawal too late")))
        .$(beforeUserDeadline);

      // Payment to beneficiary
      const paymentValid = ptraceIfFalse.$(pdelay(pStr("Payment missing")))
        .$(paysToAddress(datum.beneficiary, datum.amount));

      return secretValid.and(timeValid).and(paymentValid);
    })

    .onPublicWithdraw(({ secret }) => {
      // Same as withdraw but with deposit reward
      const secretValid = psha2_256.$(secret).eq(datum.hashlock);
      const timeValid = beforeUserDeadline;
      const paymentValid = paysToAddress(datum.beneficiary, datum.amount);
      const depositValid = depositPaidToSigner;

      return secretValid.and(timeValid).and(paymentValid).and(depositValid);
    })

    .onCancel(_ => {
      // Resolver can cancel after timeout
      const timeValid = ptraceIfFalse.$(pdelay(pStr("Cancel too early")))
        .$(afterCancelDeadline);

      const refundValid = ptraceIfFalse.$(pdelay(pStr("Refund missing")))
        .$(paysToAddress(datum.resolver, datum.amount));

      return timeValid.and(refundValid);
    })

    .onPublicCancel(_ => {
      // Public cancellation with deposit reward
      const timeValid = afterCancelDeadline;
      const refundValid = paysToAddress(datum.resolver, datum.amount);
      const depositValid = depositPaidToSigner;

      return timeValid.and(refundValid).and(depositValid);
    });
});

// Compile the validator
export const compiledCardanoEscrow = compile(cardanoEscrowValidator);

// Create script instance
export const cardanoEscrowScript = new Script(
  ScriptType.PlutusV3,
  compiledCardanoEscrow
);

// Generate addresses
export const cardanoEscrowMainnetAddr = new Address(
  "mainnet",
  Credential.script(cardanoEscrowScript.hash)
);

export const cardanoEscrowTestnetAddr = new Address(
  "testnet",
  Credential.script(cardanoEscrowScript.hash.clone())
);