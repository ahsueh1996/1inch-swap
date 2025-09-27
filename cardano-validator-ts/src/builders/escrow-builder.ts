import {
  Lucid,
  TxBuilder,
  UTxO,
  Data,
  Assets,
  PolicyId,
  Unit,
  fromText,
  toHex,
  fromHex,
  applyParamsToScript,
  SpendingValidator
} from "lucid-cardano";

import { FusionEscrowDatum, MerkleProof } from "../types/fusion-datum";
import { FusionEscrowRedeemer } from "../types/fusion-redeemer";
import { fusionEscrowDstScript } from "../validators/fusion-escrow-dst";

/**
 * Off-chain transaction builder for Fusion escrow operations
 * Handles deployment, withdrawals, and cancellations
 */
export class FusionEscrowBuilder {
  private lucid: Lucid;
  private validator: SpendingValidator;

  constructor(lucid: Lucid) {
    this.lucid = lucid;
    this.validator = {
      type: "PlutusV3",
      script: toHex(fusionEscrowDstScript.cbor)
    };
  }

  /**
   * Deploy new escrow UTXO on Cardano
   */
  async deployEscrow(params: {
    maker: string;
    resolver: string;
    beneficiary: string;
    asset?: { policyId: PolicyId; assetName: string };
    amount: bigint;
    secret_hash: string;
    user_deadline: number;
    cancel_after: number;
    deposit_lovelace: bigint;
    order_hash: string;
    fill_id: number;
    merkle_root?: string;
  }): Promise<string> {

    const escrowAddress = this.lucid.utils.validatorToAddress(this.validator);

    // Construct datum
    const datum: FusionEscrowDatum = {
      maker: params.maker,
      resolver: params.resolver,
      beneficiary: params.beneficiary,
      asset_policy: params.asset?.policyId || "",
      asset_name: params.asset?.assetName || "",
      remaining: params.amount,
      hashlock: params.secret_hash,
      user_deadline: BigInt(params.user_deadline),
      cancel_after: BigInt(params.cancel_after),
      deposit_lovelace: params.deposit_lovelace,
      merkle_root: params.merkle_root ? params.merkle_root : null,
      secret_index: 0n,
      total_amount: params.amount,
      order_hash: params.order_hash,
      fill_id: BigInt(params.fill_id)
    };

    // Prepare assets to lock
    let assets: Assets = { lovelace: params.deposit_lovelace };

    if (params.asset) {
      const unit: Unit = params.asset.policyId + fromText(params.asset.assetName);
      assets[unit] = params.amount;
    } else {
      assets.lovelace += params.amount;
    }

    // Build transaction
    const tx = await this.lucid
      .newTx()
      .payToContract(escrowAddress, {
        inline: Data.to(datum, FusionEscrowDatum)
      }, assets)
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  /**
   * Withdraw funds from escrow
   */
  async withdraw(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    merkle_proof?: {
      leaf_index: number;
      proof_elements: string[];
    };
    beneficiary_address: string;
  }): Promise<string> {

    const datum = Data.from(escrowUtxo.datum!, FusionEscrowDatum);
    const newRemaining = datum.remaining - params.amount;

    // Construct redeemer
    const redeemer = Data.to({
      Withdraw: {
        secret: params.secret,
        amount: params.amount,
        merkle_proof: params.merkle_proof ? {
          MerkleProof: {
            leaf_index: BigInt(params.merkle_proof.leaf_index),
            proof_elements: params.merkle_proof.proof_elements
          }
        } : null
      }
    }, FusionEscrowRedeemer);

    let tx = this.lucid
      .newTx()
      .collectFrom([escrowUtxo], redeemer)
      .attachSpendingValidator(this.validator);

    // Payment to beneficiary
    if (datum.asset_policy === "" && datum.asset_name === "") {
      // ADA payment
      tx = tx.payToAddress(params.beneficiary_address, { lovelace: params.amount });
    } else {
      // Native token payment
      const unit: Unit = datum.asset_policy + fromText(datum.asset_name);
      tx = tx.payToAddress(params.beneficiary_address, { [unit]: params.amount });
    }

    // Handle remaining funds
    if (newRemaining > 0n) {
      // Partial fill: create new escrow UTXO
      const newDatum: FusionEscrowDatum = {
        ...datum,
        remaining: newRemaining,
        secret_index: datum.secret_index + 1n
      };

      const escrowAddress = this.lucid.utils.validatorToAddress(this.validator);
      let remainingAssets: Assets = { lovelace: datum.deposit_lovelace };

      if (datum.asset_policy === "" && datum.asset_name === "") {
        remainingAssets.lovelace += newRemaining;
      } else {
        const unit: Unit = datum.asset_policy + fromText(datum.asset_name);
        remainingAssets[unit] = newRemaining;
      }

      tx = tx.payToContract(escrowAddress, {
        inline: Data.to(newDatum, FusionEscrowDatum)
      }, remainingAssets);
    }

    const completedTx = await tx.complete();
    const signedTx = await completedTx.sign().complete();
    return await signedTx.submit();
  }

  /**
   * Public withdrawal (anyone can call, earns deposit)
   */
  async publicWithdraw(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    merkle_proof?: {
      leaf_index: number;
      proof_elements: string[];
    };
    beneficiary_address: string;
    caller_address: string;
  }): Promise<string> {

    const datum = Data.from(escrowUtxo.datum!, FusionEscrowDatum);
    const newRemaining = datum.remaining - params.amount;

    const redeemer = Data.to({
      PublicWithdraw: {
        secret: params.secret,
        amount: params.amount,
        merkle_proof: params.merkle_proof ? {
          MerkleProof: {
            leaf_index: BigInt(params.merkle_proof.leaf_index),
            proof_elements: params.merkle_proof.proof_elements
          }
        } : null
      }
    }, FusionEscrowRedeemer);

    let tx = this.lucid
      .newTx()
      .collectFrom([escrowUtxo], redeemer)
      .attachSpendingValidator(this.validator);

    // Payment to beneficiary
    if (datum.asset_policy === "" && datum.asset_name === "") {
      tx = tx.payToAddress(params.beneficiary_address, { lovelace: params.amount });
    } else {
      const unit: Unit = datum.asset_policy + fromText(datum.asset_name);
      tx = tx.payToAddress(params.beneficiary_address, { [unit]: params.amount });
    }

    // Deposit reward to caller
    tx = tx.payToAddress(params.caller_address, { lovelace: datum.deposit_lovelace });

    // Handle remaining funds (same as withdraw)
    if (newRemaining > 0n) {
      const newDatum: FusionEscrowDatum = {
        ...datum,
        remaining: newRemaining,
        secret_index: datum.secret_index + 1n
      };

      const escrowAddress = this.lucid.utils.validatorToAddress(this.validator);
      let remainingAssets: Assets = { lovelace: datum.deposit_lovelace };

      if (datum.asset_policy === "" && datum.asset_name === "") {
        remainingAssets.lovelace += newRemaining;
      } else {
        const unit: Unit = datum.asset_policy + fromText(datum.asset_name);
        remainingAssets[unit] = newRemaining;
      }

      tx = tx.payToContract(escrowAddress, {
        inline: Data.to(newDatum, FusionEscrowDatum)
      }, remainingAssets);
    }

    const completedTx = await tx.complete();
    const signedTx = await completedTx.sign().complete();
    return await signedTx.submit();
  }

  /**
   * Cancel escrow and refund resolver
   */
  async cancel(params: {
    escrowUtxo: UTxO;
    resolver_address: string;
  }): Promise<string> {

    const datum = Data.from(escrowUtxo.datum!, FusionEscrowDatum);

    const redeemer = Data.to({
      Cancel: {}
    }, FusionEscrowRedeemer);

    let tx = this.lucid
      .newTx()
      .collectFrom([escrowUtxo], redeemer)
      .attachSpendingValidator(this.validator);

    // Refund to resolver
    if (datum.asset_policy === "" && datum.asset_name === "") {
      tx = tx.payToAddress(params.resolver_address, {
        lovelace: datum.remaining + datum.deposit_lovelace
      });
    } else {
      const unit: Unit = datum.asset_policy + fromText(datum.asset_name);
      tx = tx.payToAddress(params.resolver_address, {
        [unit]: datum.remaining,
        lovelace: datum.deposit_lovelace
      });
    }

    const completedTx = await tx.complete();
    const signedTx = await completedTx.sign().complete();
    return await signedTx.submit();
  }

  /**
   * Public cancel (anyone can call, earns deposit)
   */
  async publicCancel(params: {
    escrowUtxo: UTxO;
    resolver_address: string;
    caller_address: string;
  }): Promise<string> {

    const datum = Data.from(escrowUtxo.datum!, FusionEscrowDatum);

    const redeemer = Data.to({
      PublicCancel: {}
    }, FusionEscrowRedeemer);

    let tx = this.lucid
      .newTx()
      .collectFrom([escrowUtxo], redeemer)
      .attachSpendingValidator(this.validator);

    // Refund to resolver
    if (datum.asset_policy === "" && datum.asset_name === "") {
      tx = tx
        .payToAddress(params.resolver_address, { lovelace: datum.remaining })
        .payToAddress(params.caller_address, { lovelace: datum.deposit_lovelace });
    } else {
      const unit: Unit = datum.asset_policy + fromText(datum.asset_name);
      tx = tx
        .payToAddress(params.resolver_address, { [unit]: datum.remaining })
        .payToAddress(params.caller_address, { lovelace: datum.deposit_lovelace });
    }

    const completedTx = await tx.complete();
    const signedTx = await completedTx.sign().complete();
    return await signedTx.submit();
  }

  /**
   * Get escrow UTXOs for a specific order
   */
  async getEscrowUtxos(orderHash: string): Promise<UTxO[]> {
    const escrowAddress = this.lucid.utils.validatorToAddress(this.validator);
    const utxos = await this.lucid.utxosAt(escrowAddress);

    return utxos.filter(utxo => {
      if (!utxo.datum) return false;

      try {
        const datum = Data.from(utxo.datum, FusionEscrowDatum);
        return datum.order_hash === orderHash;
      } catch {
        return false;
      }
    });
  }
}