// PLU-TS imports - using minimal subset for compilation
type Tx = any;
type UTxO = any;
type Value = any;
type TxOut = any;
type DataI = any;
type TxBuilder = any;

import { FusionEscrowDatum, FusionEscrowDatumType, MerkleProof } from "../types/fusion-datum";
import { FusionEscrowRedeemer } from "../types/fusion-redeemer";
import { FusionEscrowSrcDatum, FusionEscrowSrcRedeemer } from "../types/fusion-src-redeemer";
import { fusionEscrowDstScript } from "../validators/fusion-escrow-dst";
import { fusionEscrowSrcScript } from "../validators/fusion-escrow-src";

// Utility functions for PLU-TS compatibility
function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Placeholder implementations for PLU-TS functions that don't exist yet
function createValidatorAddress(networkId: number, scriptHash: any): any {
  // TODO: Replace with actual PLU-TS Address.fromCredentials when available
  return {
    toString: () => `addr_test1_placeholder_${networkId}_${scriptHash}`,
    network: networkId === 1 ? "mainnet" : "testnet"
  } as any;
}

function createAddressFromBech32(address: string): any {
  // TODO: Replace with actual PLU-TS createAddressFromBech32 when available
  return {
    toString: () => address,
    network: address.startsWith("addr1") ? "mainnet" : "testnet"
  } as any;
}

/**
 * Unified off-chain transaction builder for Fusion escrow operations using PLU-TS
 * Handles both destination and source escrow operations:
 * - Destination escrow: Deployed by resolver, withdrawn by beneficiary
 * - Source escrow: Deployed by maker, withdrawn by taker
 */
export class FusionEscrowBuilder {
  private blockfrostProjectId: string;
  private networkId: number;

  constructor(blockfrostProjectId: string, networkId: number = 1) {
    this.blockfrostProjectId = blockfrostProjectId;
    this.networkId = networkId; // 1 for mainnet, 0 for testnet
  }

  /**
   * Deploy new destination escrow UTXO on Cardano using PLU-TS
   * This is deployed by the resolver and withdrawn by the beneficiary
   */
  async deployDestinationEscrow(params: {
    maker: string;
    resolver: string;
    beneficiary: string;
    asset?: { policyId: string; assetName: string };
    amount: bigint;
    secret_hash: string;
    user_deadline: number;
    cancel_after: number;
    deposit_lovelace: bigint;
    order_hash: string;
    fill_id: number;
    merkle_root?: string;
  }): Promise<Tx> {

    // Construct the validator address
    const validatorAddress = createValidatorAddress(
      this.networkId,
      fusionEscrowDstScript.hash
    );

    // TODO: Construct datum using proper PLU-TS types when APIs are stable
    const datum = {
      maker: params.maker,
      resolver: params.resolver,
      beneficiary: params.beneficiary,
      asset_policy: params.asset?.policyId || "",
      asset_name: params.asset?.assetName || "",
      remaining: params.amount,
      hashlock: params.secret_hash,
      user_deadline: params.user_deadline,
      cancel_after: params.cancel_after,
      deposit_lovelace: params.deposit_lovelace,
      merkle_root: params.merkle_root || null,
      secret_index: 0,
      total_amount: params.amount,
      order_hash: params.order_hash,
      fill_id: params.fill_id
    } as any;

    // Prepare value to lock
    let valueToLock = Value.lovelaces(params.deposit_lovelace);

    if (params.asset) {
      // Add native token to the value
      const tokenValue = Value.singleAsset(
        params.asset.policyId,
        params.asset.assetName,
        params.amount
      );
      valueToLock = Value.add(valueToLock)(tokenValue);
    } else {
      // Add ADA to the existing lovelace
      valueToLock = Value.add(valueToLock)(Value.lovelaces(params.amount));
    }

    // Create transaction output to the validator
    const txOut = new TxOut({
      address: validatorAddress,
      value: valueToLock,
      datum: new DataI(datum.toData())
    });

    // Build the transaction using PLU-TS TxBuilder
    const txBuilder = new TxBuilder();

    // Add the output to the validator
    txBuilder.addOutput(txOut);

    // Build and return the transaction
    return txBuilder.buildSync();
  }

  /**
   * Deploy new source escrow UTXO on Cardano using PLU-TS
   * This is deployed by the maker and withdrawn by the taker
   */
  async deploySourceEscrow(params: {
    maker: string;
    taker: string;
    resolver: string;
    asset?: { policyId: string; assetName: string };
    amount: bigint;
    secret_hash: string;
    finality_time: number;
    private_cancel_time: number;
    public_cancel_time: number;
    deposit_lovelace: bigint;
    order_hash: string;
    fill_id: number;
    merkle_root?: string;
  }): Promise<Tx> {

    // Construct the validator address
    const validatorAddress = createValidatorAddress(
      this.networkId,
      fusionEscrowSrcScript.hash
    );

    // Construct datum using PLU-TS types
    const datum = new FusionEscrowSrcDatum({
      FusionEscrowSrcDatum: {
        maker: fromHex(params.maker),
        taker: fromHex(params.taker),
        resolver: fromHex(params.resolver),
        asset_policy: fromHex(params.asset?.policyId || ""),
        asset_name: fromHex(params.asset?.assetName || ""),
        remaining: params.amount,
        initial_amount: params.amount,
        hashlock: fromHex(params.secret_hash),
        finality_time: BigInt(params.finality_time),
        private_cancel_time: BigInt(params.private_cancel_time),
        public_cancel_time: BigInt(params.public_cancel_time),
        deposit_lovelace: params.deposit_lovelace,
        merkle_root: params.merkle_root || "",
        order_hash: fromHex(params.order_hash),
        fill_id: BigInt(params.fill_id)
      }
    });

    // Prepare value to lock (source escrow is funded by maker)
    let valueToLock = Value.lovelaces(params.deposit_lovelace);

    if (params.asset) {
      // Add native token to the value
      const tokenValue = Value.singleAsset(
        params.asset.policyId,
        params.asset.assetName,
        params.amount
      );
      valueToLock = Value.add(valueToLock)(tokenValue);
    } else {
      // Add ADA to the existing lovelace
      valueToLock = Value.add(valueToLock)(Value.lovelaces(params.amount));
    }

    // Create transaction output to the validator
    const txOut = new TxOut({
      address: validatorAddress,
      value: valueToLock,
      datum: new DataI(datum.toData())
    });

    // Build the transaction using PLU-TS TxBuilder
    const txBuilder = new TxBuilder();

    // Add the output to the validator
    txBuilder.addOutput(txOut);

    // Build and return the transaction
    return txBuilder.buildSync();
  }

  /**
   * Withdraw funds from destination escrow using PLU-TS
   */
  async withdrawFromDestination(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    merkle_proof?: {
      leaf_index: number;
      proof_elements: string[];
    };
    beneficiary_address: string;
  }): Promise<Tx> {

    // Parse the datum from the UTXO
    const datum = FusionEscrowDatum.fromData(params.escrowUtxo.resolved.datum as any);
    const newRemaining = datum.remaining - params.amount;

    // Construct redeemer using PLU-TS types
    const redeemer = FusionEscrowRedeemer.Withdraw({
      secret: fromHex(params.secret),
      amount: params.amount,
      merkle_proof: params.merkle_proof ? new MerkleProof({
        MerkleProof: {
          leaf_index: BigInt(params.merkle_proof.leaf_index),
          proof_elements: params.merkle_proof.proof_elements.map(fromHex)
        }
      }) : null
    });

    const txBuilder = new TxBuilder();

    // Add the escrow UTXO as input
    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowDstScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Add payment to beneficiary
    const beneficiaryAddress = createAddressFromBech32(params.beneficiary_address);
    let paymentValue: Value;

    if (datum.asset_policy === "" && datum.asset_name === "") {
      // ADA payment
      paymentValue = Value.lovelaces(params.amount);
    } else {
      // Native token payment
      paymentValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        params.amount
      );
    }

    txBuilder.addOutput(new TxOut({
      address: beneficiaryAddress,
      value: paymentValue
    }));

    // Handle remaining funds if partial withdrawal
    if (newRemaining > 0n) {
      const newDatum = new FusionEscrowDatum({
        FusionEscrowDatum: {
          ...datum,
          remaining: newRemaining,
          secret_index: datum.secret_index + 1n
        }
      });

      const validatorAddress = createValidatorAddress(
        this.networkId,
        fusionEscrowDstScript.hash
      );

      let remainingValue = Value.lovelaces(datum.deposit_lovelace);

      if (datum.asset_policy === "" && datum.asset_name === "") {
        remainingValue = Value.add(remainingValue)(Value.lovelaces(newRemaining));
      } else {
        const tokenValue = Value.singleAsset(
          datum.asset_policy,
          datum.asset_name,
          newRemaining
        );
        remainingValue = Value.add(remainingValue)(tokenValue);
      }

      txBuilder.addOutput(new TxOut({
        address: validatorAddress,
        value: remainingValue,
        datum: new DataI(newDatum.toData())
      }));
    }

    return txBuilder.buildSync();
  }

  /**
   * Withdraw funds from source escrow (taker only, private phase)
   */
  async withdrawFromSource(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    merkle_proof?: {
      leaf_index: number;
      proof_elements: string[];
    };
    taker_address: string;
  }): Promise<Tx> {

    // Parse the datum from the UTXO
    const datum = FusionEscrowSrcDatum.fromData(params.escrowUtxo.resolved.datum as any);
    const newRemaining = datum.remaining - params.amount;

    // Construct redeemer using PLU-TS types
    const redeemer = FusionEscrowSrcRedeemer.Withdraw({
      secret: fromHex(params.secret),
      amount: params.amount,
      merkle_proof: params.merkle_proof ? new MerkleProof({
        MerkleProof: {
          leaf_index: BigInt(params.merkle_proof.leaf_index),
          proof_elements: params.merkle_proof.proof_elements.map(fromHex)
        }
      }) : null
    });

    const txBuilder = new TxBuilder();

    // Add the escrow UTXO as input
    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowSrcScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Add payment to taker
    const takerAddress = createAddressFromBech32(params.taker_address);
    let paymentValue: Value;

    if (datum.asset_policy === "" && datum.asset_name === "") {
      // ADA payment
      paymentValue = Value.lovelaces(params.amount);
    } else {
      // Native token payment
      paymentValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        params.amount
      );
    }

    txBuilder.addOutput(new TxOut({
      address: takerAddress,
      value: paymentValue
    }));

    // Handle remaining funds if partial withdrawal
    if (newRemaining > 0n) {
      const newDatum = new FusionEscrowSrcDatum({
        FusionEscrowSrcDatum: {
          ...datum,
          remaining: newRemaining
        }
      });

      const validatorAddress = createValidatorAddress(
        this.networkId,
        fusionEscrowSrcScript.hash
      );

      let remainingValue = Value.lovelaces(datum.deposit_lovelace);

      if (datum.asset_policy === "" && datum.asset_name === "") {
        remainingValue = Value.add(remainingValue)(Value.lovelaces(newRemaining));
      } else {
        const tokenValue = Value.singleAsset(
          datum.asset_policy,
          datum.asset_name,
          newRemaining
        );
        remainingValue = Value.add(remainingValue)(tokenValue);
      }

      txBuilder.addOutput(new TxOut({
        address: validatorAddress,
        value: remainingValue,
        datum: new DataI(newDatum.toData())
      }));
    }

    return txBuilder.buildSync();
  }

  /**
   * Withdraw to specific address from source escrow (taker only, private phase)
   */
  async withdrawToFromSource(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    to_address: string;
    merkle_proof?: {
      leaf_index: number;
      proof_elements: string[];
    };
  }): Promise<Tx> {

    const datum = FusionEscrowSrcDatum.fromData(params.escrowUtxo.resolved.datum as any);
    const newRemaining = datum.remaining - params.amount;

    const redeemer = FusionEscrowSrcRedeemer.WithdrawTo({
      secret: fromHex(params.secret),
      amount: params.amount,
      to: fromHex(params.to_address), // Assuming address is provided as hex-encoded pubkey hash
      merkle_proof: params.merkle_proof ? new MerkleProof({
        MerkleProof: {
          leaf_index: BigInt(params.merkle_proof.leaf_index),
          proof_elements: params.merkle_proof.proof_elements.map(fromHex)
        }
      }) : null
    });

    const txBuilder = new TxBuilder();

    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowSrcScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Payment to specified address
    const targetAddress = createAddressFromBech32(params.to_address);
    let paymentValue: Value;

    if (datum.asset_policy === "" && datum.asset_name === "") {
      paymentValue = Value.lovelaces(params.amount);
    } else {
      paymentValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        params.amount
      );
    }

    txBuilder.addOutput(new TxOut({
      address: targetAddress,
      value: paymentValue
    }));

    // Handle remaining funds
    if (newRemaining > 0n) {
      const newDatum = new FusionEscrowSrcDatum({
        FusionEscrowSrcDatum: {
          ...datum,
          remaining: newRemaining
        }
      });

      const validatorAddress = createValidatorAddress(
        this.networkId,
        fusionEscrowSrcScript.hash
      );

      let remainingValue = Value.lovelaces(datum.deposit_lovelace);

      if (datum.asset_policy === "" && datum.asset_name === "") {
        remainingValue = Value.add(remainingValue)(Value.lovelaces(newRemaining));
      } else {
        const tokenValue = Value.singleAsset(
          datum.asset_policy,
          datum.asset_name,
          newRemaining
        );
        remainingValue = Value.add(remainingValue)(tokenValue);
      }

      txBuilder.addOutput(new TxOut({
        address: validatorAddress,
        value: remainingValue,
        datum: new DataI(newDatum.toData())
      }));
    }

    return txBuilder.buildSync();
  }

  /**
   * Public withdrawal from destination escrow (anyone can call, earns deposit)
   */
  async publicWithdrawFromDestination(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    merkle_proof?: {
      leaf_index: number;
      proof_elements: string[];
    };
    beneficiary_address: string;
    caller_address: string;
  }): Promise<Tx> {

    const datum = FusionEscrowDatum.fromData(params.escrowUtxo.resolved.datum as any);
    const newRemaining = datum.remaining - params.amount;

    const redeemer = FusionEscrowRedeemer.PublicWithdraw({
      secret: fromHex(params.secret),
      amount: params.amount,
      merkle_proof: params.merkle_proof ? new MerkleProof({
        MerkleProof: {
          leaf_index: BigInt(params.merkle_proof.leaf_index),
          proof_elements: params.merkle_proof.proof_elements.map(fromHex)
        }
      }) : null
    });

    const txBuilder = new TxBuilder();

    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowDstScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Payment to beneficiary
    const beneficiaryAddress = createAddressFromBech32(params.beneficiary_address);
    let paymentValue: Value;

    if (datum.asset_policy === "" && datum.asset_name === "") {
      paymentValue = Value.lovelaces(params.amount);
    } else {
      paymentValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        params.amount
      );
    }

    txBuilder.addOutput(new TxOut({
      address: beneficiaryAddress,
      value: paymentValue
    }));

    // Deposit reward to caller
    const callerAddress = createAddressFromBech32(params.caller_address);
    txBuilder.addOutput(new TxOut({
      address: callerAddress,
      value: Value.lovelaces(datum.deposit_lovelace)
    }));

    // Handle remaining funds (same as withdraw)
    if (newRemaining > 0n) {
      const newDatum = new FusionEscrowDatum({
        FusionEscrowDatum: {
          ...datum,
          remaining: newRemaining,
          secret_index: datum.secret_index + 1n
        }
      });

      const validatorAddress = createValidatorAddress(
        this.networkId,
        fusionEscrowDstScript.hash
      );

      let remainingValue = Value.lovelaces(datum.deposit_lovelace);

      if (datum.asset_policy === "" && datum.asset_name === "") {
        remainingValue = Value.add(remainingValue)(Value.lovelaces(newRemaining));
      } else {
        const tokenValue = Value.singleAsset(
          datum.asset_policy,
          datum.asset_name,
          newRemaining
        );
        remainingValue = Value.add(remainingValue)(tokenValue);
      }

      txBuilder.addOutput(new TxOut({
        address: validatorAddress,
        value: remainingValue,
        datum: new DataI(newDatum.toData())
      }));
    }

    return txBuilder.buildSync();
  }

  /**
   * Public withdrawal from source escrow (anyone can call, earns deposit)
   */
  async publicWithdrawFromSource(params: {
    escrowUtxo: UTxO;
    secret: string;
    amount: bigint;
    merkle_proof?: {
      leaf_index: number;
      proof_elements: string[];
    };
    taker_address: string;
    caller_address: string;
  }): Promise<Tx> {

    const datum = FusionEscrowSrcDatum.fromData(params.escrowUtxo.resolved.datum as any);
    const newRemaining = datum.remaining - params.amount;

    const redeemer = FusionEscrowSrcRedeemer.PublicWithdraw({
      secret: fromHex(params.secret),
      amount: params.amount,
      merkle_proof: params.merkle_proof ? new MerkleProof({
        MerkleProof: {
          leaf_index: BigInt(params.merkle_proof.leaf_index),
          proof_elements: params.merkle_proof.proof_elements.map(fromHex)
        }
      }) : null
    });

    const txBuilder = new TxBuilder();

    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowSrcScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Payment to taker
    const takerAddress = createAddressFromBech32(params.taker_address);
    let paymentValue: Value;

    if (datum.asset_policy === "" && datum.asset_name === "") {
      paymentValue = Value.lovelaces(params.amount);
    } else {
      paymentValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        params.amount
      );
    }

    txBuilder.addOutput(new TxOut({
      address: takerAddress,
      value: paymentValue
    }));

    // Deposit reward to caller
    const callerAddress = createAddressFromBech32(params.caller_address);
    txBuilder.addOutput(new TxOut({
      address: callerAddress,
      value: Value.lovelaces(datum.deposit_lovelace)
    }));

    // Handle remaining funds
    if (newRemaining > 0n) {
      const newDatum = new FusionEscrowSrcDatum({
        FusionEscrowSrcDatum: {
          ...datum,
          remaining: newRemaining
        }
      });

      const validatorAddress = createValidatorAddress(
        this.networkId,
        fusionEscrowSrcScript.hash
      );

      let remainingValue = Value.lovelaces(datum.deposit_lovelace);

      if (datum.asset_policy === "" && datum.asset_name === "") {
        remainingValue = Value.add(remainingValue)(Value.lovelaces(newRemaining));
      } else {
        const tokenValue = Value.singleAsset(
          datum.asset_policy,
          datum.asset_name,
          newRemaining
        );
        remainingValue = Value.add(remainingValue)(tokenValue);
      }

      txBuilder.addOutput(new TxOut({
        address: validatorAddress,
        value: remainingValue,
        datum: new DataI(newDatum.toData())
      }));
    }

    return txBuilder.buildSync();
  }

  /**
   * Cancel destination escrow and refund resolver
   */
  async cancelDestination(params: {
    escrowUtxo: UTxO;
    resolver_address: string;
  }): Promise<Tx> {

    const datum = FusionEscrowDatum.fromData(params.escrowUtxo.resolved.datum as any);

    const redeemer = FusionEscrowRedeemer.Cancel({});

    const txBuilder = new TxBuilder();

    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowDstScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Refund to resolver
    const resolverAddress = createAddressFromBech32(params.resolver_address);
    let refundValue: Value;

    if (datum.asset_policy === "" && datum.asset_name === "") {
      refundValue = Value.lovelaces(datum.remaining + datum.deposit_lovelace);
    } else {
      const tokenValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        datum.remaining
      );
      refundValue = Value.add(Value.lovelaces(datum.deposit_lovelace))(tokenValue);
    }

    txBuilder.addOutput(new TxOut({
      address: resolverAddress,
      value: refundValue
    }));

    return txBuilder.buildSync();
  }

  /**
   * Cancel source escrow and refund maker (private phase)
   */
  async cancelSource(params: {
    escrowUtxo: UTxO;
    maker_address: string;
  }): Promise<Tx> {

    const datum = FusionEscrowSrcDatum.fromData(params.escrowUtxo.resolved.datum as any);

    const redeemer = FusionEscrowSrcRedeemer.Cancel({});

    const txBuilder = new TxBuilder();

    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowSrcScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Refund to maker
    const makerAddress = createAddressFromBech32(params.maker_address);
    let refundValue: Value;

    if (datum.asset_policy === "" && datum.asset_name === "") {
      refundValue = Value.lovelaces(datum.remaining + datum.deposit_lovelace);
    } else {
      const tokenValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        datum.remaining
      );
      refundValue = Value.add(Value.lovelaces(datum.deposit_lovelace))(tokenValue);
    }

    txBuilder.addOutput(new TxOut({
      address: makerAddress,
      value: refundValue
    }));

    return txBuilder.buildSync();
  }

  /**
   * Public cancel destination escrow (anyone can call, earns deposit)
   */
  async publicCancelDestination(params: {
    escrowUtxo: UTxO;
    resolver_address: string;
    caller_address: string;
  }): Promise<Tx> {

    const datum = FusionEscrowDatum.fromData(params.escrowUtxo.resolved.datum as any);

    const redeemer = FusionEscrowRedeemer.PublicCancel({});

    const txBuilder = new TxBuilder();

    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowDstScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Refund to resolver
    const resolverAddress = createAddressFromBech32(params.resolver_address);
    const callerAddress = createAddressFromBech32(params.caller_address);

    if (datum.asset_policy === "" && datum.asset_name === "") {
      // ADA refund
      txBuilder.addOutput(new TxOut({
        address: resolverAddress,
        value: Value.lovelaces(datum.remaining)
      }));
    } else {
      // Native token refund
      const tokenValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        datum.remaining
      );
      txBuilder.addOutput(new TxOut({
        address: resolverAddress,
        value: tokenValue
      }));
    }

    // Deposit reward to caller
    txBuilder.addOutput(new TxOut({
      address: callerAddress,
      value: Value.lovelaces(datum.deposit_lovelace)
    }));

    return txBuilder.buildSync();
  }

  /**
   * Public cancel source escrow (anyone can call, earns deposit)
   */
  async publicCancelSource(params: {
    escrowUtxo: UTxO;
    maker_address: string;
    caller_address: string;
  }): Promise<Tx> {

    const datum = FusionEscrowSrcDatum.fromData(params.escrowUtxo.resolved.datum as any);

    const redeemer = FusionEscrowSrcRedeemer.PublicCancel({});

    const txBuilder = new TxBuilder();

    txBuilder.addInput({
      utxo: params.escrowUtxo,
      inputScript: {
        script: fusionEscrowSrcScript,
        redeemer: new DataI(redeemer.toData())
      }
    });

    // Refund to maker
    const makerAddress = createAddressFromBech32(params.maker_address);
    const callerAddress = createAddressFromBech32(params.caller_address);

    if (datum.asset_policy === "" && datum.asset_name === "") {
      // ADA refund
      txBuilder.addOutput(new TxOut({
        address: makerAddress,
        value: Value.lovelaces(datum.remaining)
      }));
    } else {
      // Native token refund
      const tokenValue = Value.singleAsset(
        datum.asset_policy,
        datum.asset_name,
        datum.remaining
      );
      txBuilder.addOutput(new TxOut({
        address: makerAddress,
        value: tokenValue
      }));
    }

    // Deposit reward to caller
    txBuilder.addOutput(new TxOut({
      address: callerAddress,
      value: Value.lovelaces(datum.deposit_lovelace)
    }));

    return txBuilder.buildSync();
  }

  /**
   * Get destination escrow UTXOs for a specific order using Blockfrost
   */
  async getDestinationEscrowUtxos(orderHash: string): Promise<UTxO[]> {
    // TODO: Implement using @harmoniclabs/blockfrost-pluts
    // This would query the validator address for UTXOs and filter by order_hash in datum
    throw new Error("getDestinationEscrowUtxos not yet implemented - requires Blockfrost integration");
  }

  /**
   * Get source escrow UTXOs for a specific order using Blockfrost
   */
  async getSourceEscrowUtxos(orderHash: string): Promise<UTxO[]> {
    // TODO: Implement using @harmoniclabs/blockfrost-pluts
    // This would query the validator address for UTXOs and filter by order_hash in datum
    throw new Error("getSourceEscrowUtxos not yet implemented - requires Blockfrost integration");
  }

  // Legacy method names for backward compatibility
  async deployEscrow(params: any): Promise<Tx> {
    return this.deployDestinationEscrow(params);
  }

  async withdraw(params: any): Promise<Tx> {
    return this.withdrawFromDestination(params);
  }

  async publicWithdraw(params: any): Promise<Tx> {
    return this.publicWithdrawFromDestination(params);
  }

  async cancel(params: any): Promise<Tx> {
    return this.cancelDestination(params);
  }

  async publicCancel(params: any): Promise<Tx> {
    return this.publicCancelDestination(params);
  }

  async getEscrowUtxos(orderHash: string): Promise<UTxO[]> {
    return this.getDestinationEscrowUtxos(orderHash);
  }
}