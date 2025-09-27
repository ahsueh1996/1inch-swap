use aiken/builtin
use aiken/collection/list
use aiken/hash.{sha2_256}
use aiken/interval.{Finite}
use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{VerificationKeyCredential}
use aiken/transaction/value.{PolicyId, AssetName, lovelace_of, quantity_of}
use aiken/primitive/bytearray

type PubKeyHash = ByteArray

type Datum {
  maker: PubKeyHash,
  resolver: PubKeyHash,
  beneficiary: PubKeyHash,
  asset_policy: PolicyId,
  asset_name: AssetName,
  remaining: Int,
  hashlock: ByteArray,
  user_deadline: Int,
  cancel_after: Int,
  deposit_lovelace: Int,
  merkle_root: Option<ByteArray>,
  secret_index: Int,
}

type Redeemer {
  Withdraw(ByteArray, Int, Option<List<ByteArray>>)
  PublicWithdraw(ByteArray, Int, Option<List<ByteArray>>)
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

fn pays_lovelace_to_pkh(pkh: PubKeyHash, amount: Int, ctx: ScriptContext) -> Bool {
  list.any(
    ctx.transaction.outputs,
    fn(output) {
      when output.address.payment_credential is {
        VerificationKeyCredential(vk) ->
          vk == pkh && lovelace_of(output.value) >= amount
        _ -> False
      }
    },
  )
}

fn pays_asset_to_pkh(pkh: PubKeyHash, policy: PolicyId, name: AssetName, amount: Int, ctx: ScriptContext) -> Bool {
  list.any(
    ctx.transaction.outputs,
    fn(output) {
      when output.address.payment_credential is {
        VerificationKeyCredential(vk) ->
          vk == pkh && quantity_of(output.value, policy, name) >= amount
        _ -> False
      }
    },
  )
}

fn deposit_paid_to_signer(min_deposit: Int, ctx: ScriptContext) -> Bool {
  list.any(
    ctx.transaction.outputs,
    fn(output) {
      when output.address.payment_credential is {
        VerificationKeyCredential(vk) -> {
          let is_signer = list.any(ctx.transaction.extra_signatories, fn(sig) { vk == sig })
          is_signer && lovelace_of(output.value) >= min_deposit
        }
        _ -> False
      }
    },
  )
}

fn script_change_ok(new_remaining: Int) -> Bool {
  new_remaining >= 0
}

fn verify_merkle_proof(leaf: ByteArray, proof: List<ByteArray>, root: ByteArray) -> Bool {
  let computed_root = list.foldr(
    proof,
    leaf,
    fn(proof_elem, current_hash) {
      sha2_256(bytearray.concat(current_hash, proof_elem))
    },
  )
  computed_root == root
}

fn validate_secret(secret: ByteArray, proof: Option<List<ByteArray>>, datum: Datum) -> Bool {
  when datum.merkle_root is {
    None -> sha2_256(secret) == datum.hashlock
    Some(root) ->
      when proof is {
        Some(merkle_proof) -> {
          let leaf = sha2_256(secret)
          verify_merkle_proof(leaf, merkle_proof, root)
        }
        None -> False
      }
  }
}

validator escrow_dst(datum: Datum, redeemer: Redeemer, ctx: ScriptContext) -> Bool {
  let is_ada = datum.asset_policy == #"" && datum.asset_name == #""

  when redeemer is {
    Withdraw(secret, amount, merkle_proof) -> {
      let deadline_ok = before_or_at(datum.user_deadline, ctx)
      let secret_ok = validate_secret(secret, merkle_proof, datum)
      let amount_ok = amount > 0 && amount <= datum.remaining

      let payment_ok = if is_ada {
        pays_lovelace_to_pkh(datum.beneficiary, amount, ctx)
      } else {
        pays_asset_to_pkh(datum.beneficiary, datum.asset_policy, datum.asset_name, amount, ctx)
      }

      let change_ok = script_change_ok(datum.remaining - amount)

      deadline_ok && secret_ok && amount_ok && payment_ok && change_ok
    }

    PublicWithdraw(secret, amount, merkle_proof) -> {
      let deadline_ok = before_or_at(datum.user_deadline, ctx)
      let secret_ok = validate_secret(secret, merkle_proof, datum)
      let amount_ok = amount > 0 && amount <= datum.remaining

      let payment_ok = if is_ada {
        pays_lovelace_to_pkh(datum.beneficiary, amount, ctx)
      } else {
        pays_asset_to_pkh(datum.beneficiary, datum.asset_policy, datum.asset_name, amount, ctx)
      }

      let deposit_ok = deposit_paid_to_signer(datum.deposit_lovelace, ctx)
      let change_ok = script_change_ok(datum.remaining - amount)

      deadline_ok && secret_ok && amount_ok && payment_ok && deposit_ok && change_ok
    }

    Cancel -> {
      let timeout_ok = after_or_at(datum.cancel_after, ctx)

      let refund_ok = if is_ada {
        pays_lovelace_to_pkh(datum.resolver, datum.remaining, ctx)
      } else {
        pays_asset_to_pkh(datum.resolver, datum.asset_policy, datum.asset_name, datum.remaining, ctx)
      }

      timeout_ok && refund_ok
    }

    PublicCancel -> {
      let timeout_ok = after_or_at(datum.cancel_after, ctx)

      let refund_ok = if is_ada {
        pays_lovelace_to_pkh(datum.resolver, datum.remaining, ctx)
      } else {
        pays_asset_to_pkh(datum.resolver, datum.asset_policy, datum.asset_name, datum.remaining, ctx)
      }

      let deposit_ok = deposit_paid_to_signer(datum.deposit_lovelace, ctx)

      timeout_ok && refund_ok && deposit_ok
    }
  }
}