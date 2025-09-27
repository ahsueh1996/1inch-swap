import { describe, it, expect } from "@jest/globals";
import {
  PubKeyHash,
  DataConstr,
  DataI,
  DataB,
  Address,
  Credential,
  UTxO,
  TxOutRef,
  TxOut,
  Value
} from "@harmoniclabs/plu-ts";

import {
  FusionEscrowSrcBuilder
} from "../builders/escrow-src-builder";
import {
  FusionEscrowSrcDatum,
  FusionEscrowSrcExtendedRedeemer
} from "../types/fusion-src-redeemer";

describe("Fusion Escrow Source", () => {
  const network = "testnet";
  const builder = new FusionEscrowSrcBuilder(network);

  // Test addresses and keys
  const makerPkh = PubKeyHash.from("00".repeat(28));
  const resolverPkh = PubKeyHash.from("11".repeat(28));
  const takerPkh = PubKeyHash.from("22".repeat(28));
  const targetPkh = PubKeyHash.from("33".repeat(28));

  const makerAddress = new Address("testnet", Credential.pubKey(makerPkh));
  const takerAddress = new Address("testnet", Credential.pubKey(takerPkh));
  const targetAddress = new Address("testnet", Credential.pubKey(targetPkh));

  // Test parameters
  const secret = "deadbeef".repeat(8); // 32 bytes
  const secretHash = "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"; // sha256 of secret
  const amount = 1000000n; // 1 ADA
  const depositAmount = 2000000n; // 2 ADA

  const testParams = {
    maker: makerPkh,
    resolver: resolverPkh,
    beneficiary: takerPkh,
    amount: amount,
    hashlock: secretHash,
    userDeadline: Math.floor(Date.now() / 1000) + 3600,
    publicDeadline: Math.floor(Date.now() / 1000) + 7200,
    cancelAfter: Math.floor(Date.now() / 1000) + 86400,
    depositLovelace: depositAmount,
    orderHash: "fusion".repeat(12), // 60 chars
    fillId: 1,
    finalityBlocks: 10,
    deployedAtBlock: 1000,
    makerUtxos: []
  };

  describe("Builder functionality", () => {
    it("should create a valid deployment transaction", () => {
      const deployTx = builder.buildDeployTx(testParams);

      expect(deployTx).toBeDefined();
      expect(deployTx.outputs.length).toBeGreaterThan(0);

      const escrowOutput = deployTx.outputs[0];
      expect(escrowOutput.address.toString()).toBe(builder.getAddress().toString());
      expect(escrowOutput.value.lovelaces).toBe(amount + depositAmount);
    });

    it("should get correct script hash and address", () => {
      const scriptHash = builder.getScriptHash();
      const address = builder.getAddress();

      expect(scriptHash).toBeDefined();
      expect(scriptHash.length).toBe(56); // 28 bytes hex
      expect(address).toBeDefined();
      expect(address.network).toBe("testnet");
    });
  });

  describe("Transaction building", () => {
    let mockEscrowUtxo: UTxO;

    beforeEach(() => {
      // Create mock escrow UTXO
      const datum = new DataConstr(0, [
        new DataB(makerPkh.toBuffer()),
        new DataB(resolverPkh.toBuffer()),
        new DataB(takerPkh.toBuffer()),
        new DataB(Buffer.from("", "hex")), // ADA asset policy
        new DataB(Buffer.from("", "hex")), // ADA asset name
        new DataI(amount),
        new DataI(amount), // initial_amount
        new DataB(Buffer.from(secretHash, "hex")),
        new DataI(testParams.userDeadline),
        new DataI(testParams.publicDeadline),
        new DataI(testParams.cancelAfter),
        new DataI(depositAmount),
        new DataConstr(0, []), // No merkle root
        new DataB(Buffer.from(testParams.orderHash, "hex")),
        new DataI(testParams.fillId),
        new DataI(testParams.finalityBlocks),
        new DataI(testParams.deployedAtBlock)
      ]);

      mockEscrowUtxo = new UTxO({
        utxoRef: new TxOutRef("a".repeat(64), 0),
        resolved: new TxOut({
          address: builder.getAddress(),
          value: Value.lovelaces(amount + depositAmount),
          datum: datum
        })
      });
    });

    it("should build withdrawal transaction", () => {
      const withdrawTx = builder.buildWithdrawTx({
        escrowUtxo: mockEscrowUtxo,
        secret: secret,
        amount: amount,
        takerAddress: takerAddress
      });

      expect(withdrawTx).toBeDefined();
      expect(withdrawTx.inputs.length).toBe(1);
      expect(withdrawTx.outputs.length).toBeGreaterThan(0);

      // Should have payment to taker
      const paymentOutput = withdrawTx.outputs.find(out =>
        out.address.toString() === takerAddress.toString()
      );
      expect(paymentOutput).toBeDefined();
      expect(paymentOutput?.value.lovelaces).toBe(amount);
    });

    it("should build withdrawTo transaction", () => {
      const withdrawToTx = builder.buildWithdrawToTx({
        escrowUtxo: mockEscrowUtxo,
        secret: secret,
        amount: amount,
        target: targetPkh,
        targetAddress: targetAddress
      });

      expect(withdrawToTx).toBeDefined();
      expect(withdrawToTx.inputs.length).toBe(1);
      expect(withdrawToTx.outputs.length).toBeGreaterThan(0);

      // Should have payment to target
      const paymentOutput = withdrawToTx.outputs.find(out =>
        out.address.toString() === targetAddress.toString()
      );
      expect(paymentOutput).toBeDefined();
      expect(paymentOutput?.value.lovelaces).toBe(amount);
    });

    it("should build public withdrawal transaction", () => {
      const callerAddress = new Address("testnet", Credential.pubKey(PubKeyHash.from("44".repeat(28))));

      const publicWithdrawTx = builder.buildPublicWithdrawTx({
        escrowUtxo: mockEscrowUtxo,
        secret: secret,
        amount: amount,
        takerAddress: takerAddress,
        callerAddress: callerAddress
      });

      expect(publicWithdrawTx).toBeDefined();
      expect(publicWithdrawTx.inputs.length).toBe(1);
      expect(publicWithdrawTx.outputs.length).toBeGreaterThan(1);

      // Should have payment to taker
      const takerOutput = publicWithdrawTx.outputs.find(out =>
        out.address.toString() === takerAddress.toString()
      );
      expect(takerOutput).toBeDefined();

      // Should have deposit payment to caller
      const callerOutput = publicWithdrawTx.outputs.find(out =>
        out.address.toString() === callerAddress.toString()
      );
      expect(callerOutput).toBeDefined();
      expect(callerOutput?.value.lovelaces).toBe(depositAmount);
    });

    it("should build cancel transaction", () => {
      const cancelTx = builder.buildCancelTx({
        escrowUtxo: mockEscrowUtxo,
        makerAddress: makerAddress
      });

      expect(cancelTx).toBeDefined();
      expect(cancelTx.inputs.length).toBe(1);
      expect(cancelTx.outputs.length).toBe(1);

      // Should refund to maker
      const refundOutput = cancelTx.outputs[0];
      expect(refundOutput.address.toString()).toBe(makerAddress.toString());
      expect(refundOutput.value.lovelaces).toBe(amount + depositAmount);
    });

    it("should build public cancel transaction", () => {
      const callerAddress = new Address("testnet", Credential.pubKey(PubKeyHash.from("44".repeat(28))));

      const publicCancelTx = builder.buildPublicCancelTx({
        escrowUtxo: mockEscrowUtxo,
        makerAddress: makerAddress,
        callerAddress: callerAddress
      });

      expect(publicCancelTx).toBeDefined();
      expect(publicCancelTx.inputs.length).toBe(1);
      expect(publicCancelTx.outputs.length).toBe(2);

      // Should have refund to maker (minus deposit)
      const makerOutput = publicCancelTx.outputs.find(out =>
        out.address.toString() === makerAddress.toString()
      );
      expect(makerOutput).toBeDefined();
      expect(makerOutput?.value.lovelaces).toBe(amount);

      // Should have deposit to caller
      const callerOutput = publicCancelTx.outputs.find(out =>
        out.address.toString() === callerAddress.toString()
      );
      expect(callerOutput).toBeDefined();
      expect(callerOutput?.value.lovelaces).toBe(depositAmount);
    });
  });

  describe("Datum validation", () => {
    it("should create valid datum structure", () => {
      const deployTx = builder.buildDeployTx(testParams);
      const escrowOutput = deployTx.outputs[0];

      expect(escrowOutput.datum).toBeDefined();
      expect(escrowOutput.datum).toBeInstanceOf(DataConstr);

      const datum = escrowOutput.datum as DataConstr;
      expect(datum.fields.length).toBe(17); // All required fields

      // Validate key fields
      expect((datum.fields[0] as DataB).bytes).toEqual(makerPkh.toBuffer());
      expect((datum.fields[1] as DataB).bytes).toEqual(resolverPkh.toBuffer());
      expect((datum.fields[2] as DataB).bytes).toEqual(takerPkh.toBuffer());
      expect((datum.fields[5] as DataI).int).toBe(amount);
      expect((datum.fields[11] as DataI).int).toBe(depositAmount);
    });
  });

  describe("Network compatibility", () => {
    it("should work on mainnet", () => {
      const mainnetBuilder = new FusionEscrowSrcBuilder("mainnet");
      const address = mainnetBuilder.getAddress();

      expect(address.network).toBe("mainnet");
    });

    it("should work on testnet", () => {
      const testnetBuilder = new FusionEscrowSrcBuilder("testnet");
      const address = testnetBuilder.getAddress();

      expect(address.network).toBe("testnet");
    });
  });
});