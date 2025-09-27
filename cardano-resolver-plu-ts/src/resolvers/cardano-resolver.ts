import { Lucid, Blockfrost, fromText, toHex, Data, UTxO, Assets } from "lucid-cardano";
import { createHash, randomBytes } from "crypto";
import { EventEmitter } from "events";
import {
  CrossChainOrder,
  CardanoEscrowParams,
  OrderStatus,
  ResolverConfig,
  TxResult,
  SecretInfo,
  ProfitCalculation
} from "../types/resolver-types";
import {
  CardanoEscrowDatum,
  CardanoEscrowRedeemer,
  cardanoEscrowScript,
  cardanoEscrowTestnetAddr,
  cardanoEscrowMainnetAddr
} from "../contracts/cardano-escrow";

/**
 * Cardano Cross-Chain Resolver
 * Similar to the GitHub gist but using plu-ts for on-chain interactions
 */
export class CardanoResolver extends EventEmitter {
  private lucid!: Lucid;
  private config: ResolverConfig;
  private activeOrders = new Map<string, OrderStatus>();
  private secrets = new Map<string, SecretInfo>();
  private validator: any;
  private escrowAddress!: string;

  constructor(config: ResolverConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize the resolver
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Cardano Resolver...');

    // Initialize Lucid with Blockfrost
    this.lucid = await Lucid.new(
      new Blockfrost(
        `https://cardano-${this.config.cardanoNetwork}.blockfrost.io/api/v0`,
        this.config.blockfrostApiKey
      ),
      this.config.cardanoNetwork as "Mainnet" | "Testnet" | "Preview" | "Preprod"
    );

    // Set up wallet from seed
    this.lucid.selectWalletFromSeed(this.config.walletSeed);

    // Set up validator
    this.validator = {
      type: "PlutusV3",
      script: toHex(cardanoEscrowScript.cbor)
    };

    this.escrowAddress = this.config.cardanoNetwork === 'mainnet'
      ? cardanoEscrowMainnetAddr.toString()
      : cardanoEscrowTestnetAddr.toString();

    console.log(`✅ Cardano Resolver initialized on ${this.config.cardanoNetwork}`);
    console.log(`📍 Escrow Address: ${this.escrowAddress}`);
  }

  /**
   * Create a new cross-chain order (similar to newEvmOrder in the gist)
   */
  async newCardanoOrder(params: {
    makerAsset: { policyId: string; assetName: string; amount: bigint };
    takerAsset: { token: string; amount: bigint };
    srcChainId: number;
    deadline?: number;
    allowPartialFills?: boolean;
    allowMultipleFills?: boolean;
    auction?: {
      startTime: number;
      duration: number;
      initialRateBump: number;
      points: Array<{ delay: number; coefficient: number }>;
    };
    whitelist?: Array<{ address: string; allowFrom: number }>;
  }): Promise<CrossChainOrder> {

    const salt = BigInt('0x' + randomBytes(32).toString('hex'));
    const secret = randomBytes(32).toString('hex');
    const hashLock = createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex');

    const walletAddress = await this.lucid.wallet.address();
    const currentTime = Math.floor(Date.now() / 1000);

    const order: CrossChainOrder = {
      orderHash: '', // Will be computed
      maker: walletAddress,
      srcChainId: params.srcChainId,
      dstChainId: 'cardano',
      makerAsset: params.takerAsset, // Note: reversed for cross-chain
      takerAsset: {
        policyId: params.makerAsset.policyId,
        assetName: params.makerAsset.assetName,
        amount: params.makerAsset.amount
      },
      salt,
      deadline: params.deadline || (currentTime + 3600), // 1 hour default
      hashLock,
      timeLocks: {
        srcWithdrawal: 600,      // 10 minutes
        srcPublicWithdrawal: 1800, // 30 minutes
        srcCancellation: 2400,   // 40 minutes
        srcPublicCancellation: 3000, // 50 minutes
        dstWithdrawal: 600,      // 10 minutes
        dstPublicWithdrawal: 1800, // 30 minutes
        dstCancellation: 2400    // 40 minutes
      },
      safetyDeposit: {
        src: 1000000n, // 1 ADA
        dst: 2000000n  // 2 ADA
      },
      auction: params.auction,
      whitelist: params.whitelist,
      allowPartialFills: params.allowPartialFills || false,
      allowMultipleFills: params.allowMultipleFills || false
    };

    // Compute order hash
    order.orderHash = this.computeOrderHash(order);

    // Store secret
    this.secrets.set(order.orderHash, {
      secret,
      hash: hashLock,
      orderHash: order.orderHash,
      revealed: false
    });

    console.log(`📝 Created order: ${order.orderHash}`);
    return order;
  }

  /**
   * Deploy destination escrow on Cardano (similar to deploySrc in the gist)
   */
  async deployDst(params: CardanoEscrowParams): Promise<TxResult> {
    try {
      console.log(`🏗️ Deploying Cardano escrow for order: ${params.orderHash}`);

      // Construct datum
      const datum: any = {
        maker: params.maker,
        resolver: params.resolver,
        beneficiary: params.beneficiary,
        asset_policy: params.asset.policyId,
        asset_name: params.asset.assetName,
        amount: params.amount,
        hashlock: params.hashlock,
        user_deadline: BigInt(params.userDeadline),
        cancel_after: BigInt(params.cancelAfter),
        deposit_lovelace: params.depositLovelace,
        order_hash: params.orderHash,
        fill_id: BigInt(params.fillId),
        src_chain_id: 1n // Default to Ethereum
      };

      // Prepare assets to lock
      let assets: Assets = { lovelace: params.depositLovelace };

      if (params.asset.policyId && params.asset.assetName) {
        // Native token
        const unit = params.asset.policyId + fromText(params.asset.assetName);
        assets[unit] = params.amount;
      } else {
        // ADA
        assets.lovelace = (assets.lovelace || 0n) + params.amount;
      }

      // Build and submit transaction
      const tx = await this.lucid
        .newTx()
        .payToContract(this.escrowAddress, {
          inline: Data.to(datum, CardanoEscrowDatum)
        }, assets)
        .complete();

      const signedTx = await tx.sign().complete();
      const txHash = await signedTx.submit();

      // Update order status
      const orderStatus: OrderStatus = {
        orderHash: params.orderHash,
        status: 'dst_deployed',
        dstTxHash: txHash,
        createdAt: new Date(),
        updatedAt: new Date(),
        resolver: params.resolver,
        fillAmount: params.amount,
        remainingAmount: params.amount
      };

      this.activeOrders.set(params.orderHash, orderStatus);
      this.emit('dstDeployed', { orderHash: params.orderHash, txHash });

      console.log(`✅ Escrow deployed: ${txHash}`);
      return { txHash, success: true };

    } catch (error) {
      console.error('❌ Failed to deploy escrow:', error);
      return { 
        txHash: '', 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Withdraw from escrow with secret
   */
  async withdraw(params: {
    orderHash: string;
    secret: string;
    beneficiaryAddress: string;
  }): Promise<TxResult> {
    try {
      console.log(`💰 Withdrawing from escrow: ${params.orderHash}`);

      // Find escrow UTXO
      const escrowUtxos = await this.getEscrowUtxos(params.orderHash);
      if (escrowUtxos.length === 0) {
        throw new Error('No escrow UTXO found');
      }

      const escrowUtxo = escrowUtxos[0];
      if (!escrowUtxo) {
        throw new Error("No escrow UTXO found");
      }

      const datum = Data.from(escrowUtxo.datum!, CardanoEscrowDatum);

      // Construct redeemer
      const redeemer = Data.to({
        Withdraw: { secret: params.secret }
      }, CardanoEscrowRedeemer);

      // Build transaction
      let tx = this.lucid
        .newTx()
        .collectFrom([escrowUtxo], redeemer)
        .attachSpendingValidator(this.validator);

      // Payment to beneficiary
      if (datum.asset_policy === '' && datum.asset_name === '') {
        // ADA payment
        tx = tx.payToAddress(params.beneficiaryAddress, { lovelace: datum.amount });
      } else {
        // Native token payment
        const unit = datum.asset_policy + fromText(datum.asset_name);
        tx = tx.payToAddress(params.beneficiaryAddress, { [unit]: datum.amount });
      }

      const completedTx = await tx.complete();
      const signedTx = await completedTx.sign().complete();
      const txHash = await signedTx.submit();

      // Update order status
      const orderStatus = this.activeOrders.get(params.orderHash);
      if (orderStatus) {
        orderStatus.status = 'completed';
        orderStatus.updatedAt = new Date();
        this.activeOrders.set(params.orderHash, orderStatus);
      }

      // Mark secret as revealed
      const secretInfo = this.secrets.get(params.orderHash);
      if (secretInfo) {
        secretInfo.revealed = true;
        secretInfo.revealedAt = new Date();
        secretInfo.txHash = txHash;
        this.secrets.set(params.orderHash, secretInfo);
      }

      this.emit('orderCompleted', { orderHash: params.orderHash, txHash });

      console.log(`✅ Withdrawal completed: ${txHash}`);
      return { txHash, success: true };

    } catch (error) {
      console.error('❌ Withdrawal failed:', error);
      return { 
        txHash: '', 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Cancel escrow and refund resolver
   */
  async cancel(params: {
    orderHash: string;
    resolverAddress: string;
  }): Promise<TxResult> {
    try {
      console.log(`🚫 Cancelling escrow: ${params.orderHash}`);

      const escrowUtxos = await this.getEscrowUtxos(params.orderHash);
      if (escrowUtxos.length === 0) {
        throw new Error('No escrow UTXO found');
      }

      const escrowUtxo = escrowUtxos[0];
      if (!escrowUtxo) {
        throw new Error("No escrow UTXO found");
      }

      const datum = Data.from(escrowUtxo.datum!, CardanoEscrowDatum);

      // cancel redeemer as PlutusData
      const redeemer = CardanoEscrowRedeemer.Cancel({}).toData();

      // Build transaction
      let tx = this.lucid
        .newTx()
        .collectFrom([escrowUtxo], redeemer)
        .attachSpendingValidator(this.validator);


      // Refund to resolver
      if (datum.asset_policy === '' && datum.asset_name === '') {
        tx = tx.payToAddress(params.resolverAddress, {
          lovelace: datum.amount + datum.deposit_lovelace
        });
      } else {
        const unit = datum.asset_policy + fromText(datum.asset_name);
        tx = tx.payToAddress(params.resolverAddress, {
          [unit]: datum.amount,
          lovelace: datum.deposit_lovelace
        });
      }

      const completedTx = await tx.complete();
      const signedTx = await completedTx.sign().complete();
      const txHash = await signedTx.submit();

      // Update order status
      const orderStatus = this.activeOrders.get(params.orderHash);
      if (orderStatus) {
        orderStatus.status = 'cancelled';
        orderStatus.updatedAt = new Date();
        this.activeOrders.set(params.orderHash, orderStatus);
      }

      this.emit('orderCancelled', { orderHash: params.orderHash, txHash });

      console.log(`✅ Cancellation completed: ${txHash}`);
      return { txHash, success: true };

    } catch (error) {
      console.error('❌ Cancellation failed:', error);
      return { 
        txHash: '', 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Calculate profitability of an order
   */
  async calculateProfit(order: CrossChainOrder): Promise<ProfitCalculation> {
    const gasCosts = 100000n; // Estimated EVM gas costs
    const cardanoFees = 200000n; // Estimated Cardano fees (~0.2 ADA)

    const grossProfit = order.makerAsset.amount - order.takerAsset.amount;
    const netProfit = grossProfit - gasCosts - cardanoFees;
    const profitBasisPoints = Number(netProfit * 10000n / order.takerAsset.amount);

    return {
      grossProfit,
      gasCosts,
      cardanoFees,
      netProfit,
      profitBasisPoints,
      isProfitable: profitBasisPoints >= this.config.minProfitBasisPoints
    };
  }

  /**
   * Get escrow UTXOs for a specific order
   */
  async getEscrowUtxos(orderHash: string): Promise<UTxO[]> {
    const utxos = await this.lucid.utxosAt(this.escrowAddress);

    return utxos.filter(utxo => {
      if (!utxo.datum) return false;

      try {
        const datum = Data.from(utxo.datum, CardanoEscrowDatum);
        return datum.order_hash === orderHash;
      } catch {
        return false;
      }
    });
  }

  /**
   * Get order status
   */
  getOrderStatus(orderHash: string): OrderStatus | undefined {
    return this.activeOrders.get(orderHash);
  }

  /**
   * Get all active orders
   */
  getActiveOrders(): OrderStatus[] {
    return Array.from(this.activeOrders.values());
  }

  /**
   * Get secret for an order
   */
  getSecret(orderHash: string): SecretInfo | undefined {
    return this.secrets.get(orderHash);
  }

  /**
   * Compute order hash (simplified)
   */
  private computeOrderHash(order: CrossChainOrder): string {
    const data = JSON.stringify({
      maker: order.maker,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      salt: order.salt.toString(),
      deadline: order.deadline
    });

    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Monitor blockchain events
   */
  async startMonitoring(): Promise<void> {
    console.log('👀 Starting order monitoring...');

    // Monitor for timeout events
    setInterval(() => {
      this.checkTimeouts();
    }, 30000); // Check every 30 seconds

    // Monitor for secret revelations
    setInterval(() => {
      this.checkSecretRevelations();
    }, 15000); // Check every 15 seconds
  }

  /**
   * Check for order timeouts
   */
  private checkTimeouts(): void {
    const currentTime = Math.floor(Date.now() / 1000);

    for (const [orderHash, status] of this.activeOrders) {
      if (status.status === 'dst_deployed' || status.status === 'completing') {
        // Check if order has expired
        const hoursElapsed = (Date.now() - status.createdAt.getTime()) / (1000 * 60 * 60);

        if (hoursElapsed > 2) { // 2 hour timeout
          console.log(`⏰ Order ${orderHash} timed out, initiating cancellation`);
          this.emit('orderTimeout', { orderHash });
        }
      }
    }
  }

  /**
   * Check for secret revelations (would integrate with EVM monitoring)
   */
  private checkSecretRevelations(): void {
    // This would monitor EVM chain for secret revelations
    // For now, it's a placeholder that would integrate with EVM resolver
    for (const [orderHash, secretInfo] of this.secrets) {
      if (!secretInfo.revealed) {
        // TODO: Check EVM chain for secret revelation
        // This would be implemented with ethers.js event monitoring
      }
    }
  }
}