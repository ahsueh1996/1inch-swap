import {
  Address,
  DataI,
  DataB,
  Credential,
  PubKeyHash,
  TxBuilder,
  TxOut,
  Value,
  UTxO,
  PCurrencySymbol,
  PTokenName,
  Script,
  TxIn,
  DataConstr
} from "@harmoniclabs/plu-ts";

import {
  FusionEscrowSrcDatum,
  FusionEscrowSrcRedeemer,
  FusionEscrowSrcExtendedRedeemer
} from "../types/fusion-src-redeemer";
import { MerkleProof } from "../types/fusion-datum";
import {
  fusionEscrowSrcExtendedScript,
  fusionEscrowSrcExtendedMainnetAddr,
  fusionEscrowSrcExtendedTestnetAddr
} from "../validators/fusion-escrow-src-extended";

/**
 * Builder class for Fusion Source Escrow operations
 * Provides utilities for creating and interacting with source escrow contracts
 * that mirror EVM escrowSrc.sol functionality
 */
export class FusionEscrowSrcBuilder {
  private network: "mainnet" | "testnet";
  private script: Script;
  private address: Address;

  constructor(network: "mainnet" | "testnet" = "testnet") {
    this.network = network;
    this.script = fusionEscrowSrcExtendedScript;
    this.address = network === "mainnet"
      ? fusionEscrowSrcExtendedMainnetAddr
      : fusionEscrowSrcExtendedTestnetAddr;
  }

  /**
   * Create a new source escrow instance (fund locking)
   * Maps to EVM contract deployment with initial funding
   */
  buildDeployTx(params: {
    maker: PubKeyHash;
    resolver: PubKeyHash;
    beneficiary: PubKeyHash;
    assetPolicy?: string;
    assetName?: string;
    amount: bigint;
    hashlock: string;
    userDeadline: number;
    publicDeadline: number;
    cancelAfter: number;
    depositLovelace: bigint;
    merkleRoot?: string;
    orderHash: string;
    fillId: number;
    finalityBlocks: number;
    deployedAtBlock: number;
    makerUtxos: UTxO[];
  }): TxBuilder {
    const datum = new DataConstr(0, [
      new DataB(params.maker.toBuffer()),
      new DataB(params.resolver.toBuffer()),
      new DataB(params.beneficiary.toBuffer()),
      new DataB(Buffer.from(params.assetPolicy || "", "hex")),
      new DataB(Buffer.from(params.assetName || "", "hex")),
      new DataI(params.amount),
      new DataI(params.amount), // initial_amount same as amount
      new DataB(Buffer.from(params.hashlock, "hex")),
      new DataI(params.userDeadline),
      new DataI(params.publicDeadline),
      new DataI(params.cancelAfter),
      new DataI(params.depositLovelace),
      params.merkleRoot
        ? new DataConstr(1, [new DataB(Buffer.from(params.merkleRoot, "hex"))])
        : new DataConstr(0, []),
      new DataB(Buffer.from(params.orderHash, "hex")),
      new DataI(params.fillId),
      new DataI(params.finalityBlocks),
      new DataI(params.deployedAtBlock)
    ]);

    const value = params.assetPolicy && params.assetName
      ? Value.lovelaces(params.depositLovelace).add(
          Value.singleAsset(
            PCurrencySymbol.from(params.assetPolicy),
            PTokenName.from(Buffer.from(params.assetName, "hex")),
            params.amount
          )
        )
      : Value.lovelaces(params.depositLovelace + params.amount);

    const escrowOutput = new TxOut({
      address: this.address,
      value: value,
      datum: datum
    });

    const txBuilder = new TxBuilder();

    // Add maker inputs
    params.makerUtxos.forEach(utxo => {
      txBuilder.addInput(new TxIn({
        id: utxo.utxoRef.id,
        index: utxo.utxoRef.index
      }));
    });

    // Add escrow output
    txBuilder.addOutput(escrowOutput);

    return txBuilder;
  }

  /**
   * Build withdrawal transaction (private phase)
   * Maps to EVM withdraw() function
   */
  buildWithdrawTx(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    merkleProof?: {
      leafIndex: number;
      proofElements: string[];
    };
    takerAddress: Address;
    changeAddress?: Address;
  }): TxBuilder {
    const redeemer = new DataConstr(0, [ // Withdraw
      new DataB(Buffer.from(params.secret, "hex")),
      new DataI(params.amount),
      params.merkleProof
        ? new DataConstr(1, [
            new DataConstr(0, [
              new DataI(params.merkleProof.leafIndex),
              new DataConstr(0, params.merkleProof.proofElements.map(
                elem => new DataB(Buffer.from(elem, "hex"))
              ))
            ])
          ])
        : new DataConstr(0, [])
    ]);

    return this.buildWithdrawTxBase(params.escrowUtxo, redeemer, params.amount, params.takerAddress, params.changeAddress);
  }

  /**
   * Build withdrawal to target transaction (private phase)
   * Maps to EVM withdrawTo() function
   */
  buildWithdrawToTx(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    target: PubKeyHash;
    merkleProof?: {
      leafIndex: number;
      proofElements: string[];
    };
    targetAddress: Address;
    changeAddress?: Address;
  }): TxBuilder {
    const redeemer = new DataConstr(1, [ // WithdrawTo
      new DataB(Buffer.from(params.secret, "hex")),
      new DataI(params.amount),
      new DataB(params.target.toBuffer()),
      params.merkleProof
        ? new DataConstr(1, [
            new DataConstr(0, [
              new DataI(params.merkleProof.leafIndex),
              new DataConstr(0, params.merkleProof.proofElements.map(
                elem => new DataB(Buffer.from(elem, "hex"))
              ))
            ])
          ])
        : new DataConstr(0, [])
    ]);

    return this.buildWithdrawTxBase(params.escrowUtxo, redeemer, params.amount, params.targetAddress, params.changeAddress);
  }

  /**
   * Build public withdrawal transaction
   * Maps to EVM publicWithdraw() function
   */
  buildPublicWithdrawTx(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    merkleProof?: {
      leafIndex: number;
      proofElements: string[];
    };
    takerAddress: Address;
    callerAddress: Address; // Gets the deposit reward
    changeAddress?: Address;
  }): TxBuilder {
    const redeemer = new DataConstr(2, [ // PublicWithdraw
      new DataB(Buffer.from(params.secret, "hex")),
      new DataI(params.amount),
      params.merkleProof
        ? new DataConstr(1, [
            new DataConstr(0, [
              new DataI(params.merkleProof.leafIndex),
              new DataConstr(0, params.merkleProof.proofElements.map(
                elem => new DataB(Buffer.from(elem, "hex"))
              ))
            ])
          ])
        : new DataConstr(0, [])
    ]);

    const txBuilder = this.buildWithdrawTxBase(params.escrowUtxo, redeemer, params.amount, params.takerAddress, params.changeAddress);

    // Add deposit payment to caller
    const datum = params.escrowUtxo.resolved.datum;
    if (datum && datum instanceof DataConstr) {
      const depositAmount = datum.fields[11] as DataI; // deposit_lovelace field
      txBuilder.addOutput(new TxOut({
        address: params.callerAddress,
        value: Value.lovelaces(depositAmount.int),
      }));
    }

    return txBuilder;
  }

  /**
   * Build cancellation transaction (private phase)
   * Maps to EVM cancel() function
   */
  buildCancelTx(params: {
    escrowUtxo: UTxO;
    makerAddress: Address;
  }): TxBuilder {
    const redeemer = new DataConstr(3, []); // Cancel

    const txBuilder = new TxBuilder();

    // Add escrow input
    txBuilder.addInput(new TxIn({
      id: params.escrowUtxo.utxoRef.id,
      index: params.escrowUtxo.utxoRef.index
    }), redeemer);

    // Refund to maker
    txBuilder.addOutput(new TxOut({
      address: params.makerAddress,
      value: params.escrowUtxo.resolved.value
    }));

    return txBuilder;
  }

  /**
   * Build public cancellation transaction
   * Maps to EVM publicCancel() function
   */
  buildPublicCancelTx(params: {
    escrowUtxo: UTxO;
    makerAddress: Address;
    callerAddress: Address; // Gets the deposit reward
  }): TxBuilder {
    const redeemer = new DataConstr(4, []); // PublicCancel

    const txBuilder = new TxBuilder();

    // Add escrow input
    txBuilder.addInput(new TxIn({
      id: params.escrowUtxo.utxoRef.id,
      index: params.escrowUtxo.utxoRef.index
    }), redeemer);

    // Get deposit amount from datum
    const datum = params.escrowUtxo.resolved.datum;
    let depositAmount = 0n;
    if (datum && datum instanceof DataConstr) {
      depositAmount = (datum.fields[11] as DataI).int; // deposit_lovelace field
    }

    // Refund to maker (minus deposit)
    const refundValue = params.escrowUtxo.resolved.value.sub(Value.lovelaces(depositAmount));
    txBuilder.addOutput(new TxOut({
      address: params.makerAddress,
      value: refundValue
    }));

    // Deposit to caller
    txBuilder.addOutput(new TxOut({
      address: params.callerAddress,
      value: Value.lovelaces(depositAmount)
    }));

    return txBuilder;
  }

  /**
   * Helper function for building withdrawal transactions
   */
  private buildWithdrawTxBase(
    escrowUtxo: UTxO,
    redeemer: DataConstr,
    amount: bigint,
    targetAddress: Address,
    changeAddress?: Address
  ): TxBuilder {
    const txBuilder = new TxBuilder();

    // Add escrow input
    txBuilder.addInput(new TxIn({
      id: escrowUtxo.utxoRef.id,
      index: escrowUtxo.utxoRef.index
    }), redeemer);

    // Get datum to determine asset type and remaining amount
    const datum = escrowUtxo.resolved.datum;
    if (!datum || !(datum instanceof DataConstr)) {
      throw new Error("Invalid escrow datum");
    }

    const assetPolicy = (datum.fields[2] as DataB).bytes;
    const assetName = (datum.fields[3] as DataB).bytes;
    const remaining = (datum.fields[4] as DataI).int;
    const isAda = assetPolicy.length === 0 && assetName.length === 0;

    // Payment to target
    const paymentValue = isAda
      ? Value.lovelaces(amount)
      : Value.singleAsset(
          PCurrencySymbol.from(assetPolicy.toString("hex")),
          PTokenName.from(assetName),
          amount
        );

    txBuilder.addOutput(new TxOut({
      address: targetAddress,
      value: paymentValue
    }));

    // Handle partial withdrawal (script continuation)
    const newRemaining = remaining - amount;
    if (newRemaining > 0n) {
      // Create updated datum
      const updatedDatum = new DataConstr(0, [
        ...datum.fields.slice(0, 4), // Keep fields up to asset_name
        new DataI(newRemaining), // Update remaining
        ...datum.fields.slice(5) // Keep remaining fields
      ]);

      // Calculate remaining value
      const remainingValue = isAda
        ? escrowUtxo.resolved.value.sub(Value.lovelaces(amount))
        : escrowUtxo.resolved.value.sub(paymentValue);

      // Script continuation output
      txBuilder.addOutput(new TxOut({
        address: this.address,
        value: remainingValue,
        datum: updatedDatum
      }));
    }

    return txBuilder;
  }

  /**
   * Get the script hash for this validator
   */
  getScriptHash(): string {
    return this.script.hash.toString();
  }

  /**
   * Get the script address
   */
  getAddress(): Address {
    return this.address;
  }
}