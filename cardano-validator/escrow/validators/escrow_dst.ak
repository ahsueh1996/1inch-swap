use aiken/builtin
use aiken/collection/list
use aiken/hash.{sha2_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/transaction.{ScriptContext, Spend, find_input, find_script_outputs}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{PolicyId, AssetName, Value}
use cardano/transaction.{OutputReference, Input, Output}
use aiken/primitive/bytearray

type PubKeyHash = ByteArray

type Datum {
  maker            : PubKeyHash,
  resolver         : PubKeyHash,
  beneficiary      : PubKeyHash,
  asset_policy     : PolicyId,
  asset_name       : AssetName,
  remaining        : Integer,
  hashlock         : ByteArray,
  user_deadline    : Int,
  cancel_after     : Int,
  deposit_lovelace : Integer,
  merkle_root      : Option<ByteArray>,
  secret_index     : Integer
}

type Redeemer {
  Withdraw       { secret: ByteArray, amount: Integer, merkle_proof: Option<List<ByteArray>> }
  PublicWithdraw { secret: ByteArray, amount: Integer, merkle_proof: Option<List<ByteArray>> }
  Cancel
  PublicCancel
}

fn before_or_at(deadline: Int, ctx: ScriptContext) -> Bool {
  when ctx.transaction.validity_range.upper_bound.bound_type is {
    Finite(upper) -> upper <= deadline
    _ -> False
  }
}

fn after_or_at(timestamp: Int, ctx: ScriptContext) -> Bool {
  when ctx.transaction.validity_range.lower_bound.bound_type is {
    Finite(lower) -> lower >= timestamp
    _ -> False
  }
}

fn pays_lovelace_to_pkh(pkh: PubKeyHash, amount: Integer, ctx: ScriptContext) -> Bool {
  ctx.transaction.outputs
  |> list.any(fn(output) {
    when output.address.payment_credential is {
      credential.VerificationKeyCredential(vk) ->
        vk == pkh && value.lovelace_of(output.value) >= amount
      _ -> False
    }
  })
}

fn pays_asset_to_pkh(pkh: PubKeyHash, policy: PolicyId, name: AssetName, amount: Integer, ctx: ScriptContext) -> Bool {
  ctx.transaction.outputs
  |> list.any(fn(output) {
    when output.address.payment_credential is {
      credential.VerificationKeyCredential(vk) ->
        vk == pkh && value.quantity_of(output.value, policy, name) >= amount
      _ -> False
    }
  })
}

fn deposit_paid_to_signer(min_deposit: Integer, ctx: ScriptContext) -> Bool {
  ctx.transaction.outputs
  |> list.any(fn(output) {
    when output.address.payment_credential is {
      credential.VerificationKeyCredential(vk) ->
        list.any(ctx.transaction.extra_signatories, fn(sig) { vk == sig })
        && value.lovelace_of(output.value) >= min_deposit
      _ -> False
    }
  })
}

fn script_change_ok(new_remaining: Integer, current_datum: Datum, ctx: ScriptContext) -> Bool {
  let script_outputs = find_script_outputs(ctx.transaction.outputs, ctx.transaction.redeemers)
  when script_outputs is {
    [] -> new_remaining == 0
    [output] -> {
      expect datum: Datum = output.datum
      datum == Datum { ..current_datum, remaining: new_remaining }
      && new_remaining >= 0
    }
    _ -> False
  }
}

validator escrow_dst(datum: Datum, redeemer: Redeemer, ctx: ScriptContext) -> Bool {
  let is_ada = datum.asset_policy == #"" && datum.asset_name == #""

  // Validate secret against merkle root if using multi-secret
  let validate_secret = fn(secret: ByteArray, proof: Option<List<ByteArray>>) -> Bool {
    when datum.merkle_root is {
      None -> sha2_256(secret) == datum.hashlock
      Some(root) -> {
        expect Some(merkle_proof) = proof
        // Verify merkle proof (simplified - needs proper merkle tree validation)
        let leaf = sha2_256(secret)
        verify_merkle_proof(leaf, merkle_proof, root)
      }
    }
  }

  let verify_merkle_proof = fn(leaf: ByteArray, proof: List<ByteArray>, root: ByteArray) -> Bool {
    list.foldr(proof, leaf, fn(proof_elem, current_hash) {
      sha2_256(bytearray.concat(current_hash, proof_elem))
    }) == root
  }

  when redeemer is {
    Withdraw { secret, amount, merkle_proof } -> {
      assert before_or_at(datum.user_deadline, ctx), "too late"
      assert validate_secret(secret, merkle_proof), "bad secret"
      assert amount > 0 && amount <= datum.remaining, "bad amount"

      let ok = if is_ada {
        pays_lovelace_to_pkh(datum.beneficiary, amount, ctx)
      } else {
        pays_asset_to_pkh(datum.beneficiary, datum.asset_policy, datum.asset_name, amount, ctx)
      }
      assert ok, "payout missing"

      assert script_change_ok(datum.remaining - amount, datum, ctx), "bad change"
      True
    }

    PublicWithdraw { secret, amount, merkle_proof } -> {
      assert before_or_at(datum.user_deadline, ctx), "too late"
      assert validate_secret(secret, merkle_proof), "bad secret"
      assert amount > 0 && amount <= datum.remaining, "bad amount"

      let ok = if is_ada {
        pays_lovelace_to_pkh(datum.beneficiary, amount, ctx)
      } else {
        pays_asset_to_pkh(datum.beneficiary, datum.asset_policy, datum.asset_name, amount, ctx)
      }
      assert ok, "payout missing"

      assert deposit_paid_to_signer(datum.deposit_lovelace, ctx), "deposit missing"
      assert script_change_ok(datum.remaining - amount, datum, ctx), "bad change"
      True
    }

    Cancel -> {
      assert after_or_at(datum.cancel_after, ctx), "too early"
      let ok = if is_ada {
        pays_lovelace_to_pkh(datum.resolver, datum.remaining, ctx)
      } else {
        pays_asset_to_pkh(datum.resolver, datum.asset_policy, datum.asset_name, datum.remaining, ctx)
      }
      assert ok, "resolver refund missing"
      True
    }

    PublicCancel -> {
      assert after_or_at(datum.cancel_after, ctx), "too early"
      let ok = if is_ada {
        pays_lovelace_to_pkh(datum.resolver, datum.remaining, ctx)
      } else {
        pays_asset_to_pkh(datum.resolver, datum.asset_policy, datum.asset_name, datum.remaining, ctx)
      }
      assert ok, "resolver refund missing"

      assert deposit_paid_to_signer(datum.deposit_lovelace, ctx), "deposit missing"
      True
    }
  }
}