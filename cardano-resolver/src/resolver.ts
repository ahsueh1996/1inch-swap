/**
 * Lean Cardano Resolver for 1inch Fusion
 *
 * Off-chain service that:
 * 1. Monitors 1inch Fusion for Cardano orders
 * 2. Competes in auctions for profitable swaps
 * 3. Executes cross-chain atomic swaps
 */

import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import Sdk from '@1inch/cross-chain-sdk';
import { createHash, randomBytes } from 'crypto';
import { Database } from './database';
import { EVMTransactionBuilder } from './builders/evm-builder';
import { CardanoTransactionBuilder } from './builders/cardano-builder';
import { SecretManager } from './secret-manager';
import { RefundManager } from './refund-manager';

interface ResolverConfig {
  fusionEndpoint: string;
  evmRpcUrl: string;
  cardanoNetwork: 'mainnet' | 'testnet';
  blockfrostApiKey: string;
  resolverPrivateKey: string;
  minProfitBasisPoints: number;
  dbPath: string;
  fusionApiKey?: string;
  refundTimeoutHours: number;
}

interface FusionOrder {
  orderHash: string;
  maker: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: bigint;
  takingAmount: bigint;
  deadline: number;
  hashlock?: string;
  secretHash?: string;
  escrowExtension: Sdk.EscrowExtension;
}

interface SwapState {
  order: FusionOrder;
  evmTx?: string;
  cardanoTx?: string;
  status: 'pending' | 'evm_filled' | 'cardano_deployed' | 'awaiting_secret' | 'completed' | 'refunding' | 'cancelled';
  secret?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CardanoResolver extends EventEmitter {
  private config: ResolverConfig;
  private evmWallet: ethers.Wallet;
  private fusionWs?: WebSocket;
  private activeSwaps = new Map<string, SwapState>();
  private database: Database;
  private evmBuilder: EVMTransactionBuilder;
  private cardanoBuilder: CardanoTransactionBuilder;
  private secretManager: SecretManager;
  private refundManager: RefundManager;
  private fusionSdk: Sdk.CrossChainSDK;

  constructor(config: ResolverConfig) {
    super();
    this.config = config;
    this.evmWallet = new ethers.Wallet(
      config.resolverPrivateKey,
      new ethers.JsonRpcProvider(config.evmRpcUrl)
    );

    this.database = new Database(config.dbPath);
    this.evmBuilder = new EVMTransactionBuilder(this.evmWallet);
    this.cardanoBuilder = new CardanoTransactionBuilder(config.cardanoNetwork, config.blockfrostApiKey);
    this.secretManager = new SecretManager();
    this.refundManager = new RefundManager(this.evmBuilder, this.cardanoBuilder);
    this.fusionSdk = new Sdk.CrossChainSDK({
      apiKey: config.fusionApiKey,
      provider: this.evmWallet.provider
    });
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Cardano Resolver...');

    // Initialize database
    await this.database.init();

    // Restore active swaps from database
    await this.restoreActiveSwaps();

    // Connect to 1inch Fusion WebSocket
    await this.connectToFusion();

    // Start monitoring
    this.startMonitoring();

    console.log('✅ Cardano Resolver started');
  }

  private async connectToFusion(): Promise<void> {
    try {
      // Subscribe to 1inch Fusion orders via SDK
      await this.fusionSdk.subscribeToOrders({
        filters: {
          dstChain: 'cardano',
          minAmount: this.config.minProfitBasisPoints
        },
        onOrder: (order) => this.handleFusionOrder(order)
      });

      console.log('✅ Connected to 1inch Fusion');
    } catch (error) {
      console.error('❌ Failed to connect to Fusion:', error);
      throw error;
    }
  }

  private isCardanoOrder(order: Sdk.CrossChainOrder): boolean {
    return order.dstChainId === 'cardano' || order.takerAsset.includes('cardano');
  }

  private async handleFusionOrder(order: Sdk.CrossChainOrder): Promise<void> {
    const orderHash = order.getHash();
    console.log(`📦 New Cardano order: ${orderHash}`);

    try {
      // Convert to internal format
      const fusionOrder: FusionOrder = {
        orderHash,
        maker: order.maker.toString(),
        makerAsset: order.makerAsset.toString(),
        takerAsset: order.takerAsset.toString(),
        makingAmount: order.makingAmount,
        takingAmount: order.takingAmount,
        deadline: order.deadline,
        escrowExtension: order.escrowExtension
      };

      // Calculate profitability
      const profit = await this.calculateProfit(fusionOrder);

      if (profit < this.config.minProfitBasisPoints) {
        console.log(`❌ Order ${orderHash} not profitable`);
        return;
      }

      // Generate secret for HTLC
      const secret = this.secretManager.generateSecret();
      const secretHash = this.secretManager.hashSecret(secret);
      fusionOrder.secretHash = secretHash;

      // Store in database
      await this.database.saveSwap(orderHash, {
        order: fusionOrder,
        status: 'pending',
        secret,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Submit competitive bid
      await this.submitBid(fusionOrder, profit, secret);

    } catch (error) {
      console.error(`Error handling order ${orderHash}:`, error);
    }
  }

  private async calculateProfit(order: FusionOrder): Promise<number> {
    // Calculate cross-chain swap profitability
    // Consider: gas costs, Cardano fees, price impact, timing
    return 100; // basis points
  }

  private async submitBid(order: FusionOrder, profit: number, secret: string): Promise<void> {
    console.log(`💰 Bidding on order ${order.orderHash} (profit: ${profit}bp)`);

    try {
      // Create resolver quote with our secret hash
      const quote = await this.fusionSdk.createResolverQuote({
        order,
        secretHash: order.secretHash!,
        resolverAddress: this.evmWallet.address
      });

      // Submit the quote
      const bidResult = await this.fusionSdk.submitQuote(quote);

      if (bidResult.accepted) {
        console.log(`✅ Bid accepted for ${order.orderHash}`);
        await this.executeCrossChainSwap(order, secret);
      } else {
        console.log(`❌ Bid rejected for ${order.orderHash}`);
      }
    } catch (error) {
      console.error(`Failed to submit bid for ${order.orderHash}:`, error);
    }
  }

  private async executeCrossChainSwap(order: FusionOrder, secret: string): Promise<void> {
    console.log(`⚡ Executing swap for ${order.orderHash}`);

    try {
      // 1. Fill EVM side via transaction builder
      const evmTx = await this.evmBuilder.fillOrder(order, secret);
      console.log(`📄 EVM tx: ${evmTx}`);

      await this.database.updateSwap(order.orderHash, {
        evmTx,
        status: 'evm_filled',
        updatedAt: new Date()
      });

      // 2. Deploy Cardano escrow
      const cardanoTx = await this.cardanoBuilder.deployEscrow(order, secret);
      console.log(`📄 Cardano tx: ${cardanoTx}`);

      await this.database.updateSwap(order.orderHash, {
        cardanoTx,
        status: 'cardano_deployed',
        updatedAt: new Date()
      });

      // 3. Update active swaps tracking
      const swapState = await this.database.getSwap(order.orderHash);
      if (swapState) {
        this.activeSwaps.set(order.orderHash, swapState);
      }

      // 4. Start secret propagation process
      await this.secretManager.propagateSecret(order.orderHash, secret, evmTx, cardanoTx);

      // 5. Monitor for completion and handle refunds
      this.monitorSwapCompletion(order.orderHash);

    } catch (error) {
      console.error(`Failed to execute swap ${order.orderHash}:`, error);
      await this.database.updateSwap(order.orderHash, {
        status: 'cancelled',
        updatedAt: new Date()
      });
    }
  }

  private async restoreActiveSwaps(): Promise<void> {
    const activeSwaps = await this.database.getActiveSwaps();
    for (const swap of activeSwaps) {
      this.activeSwaps.set(swap.order.orderHash, swap);
      this.monitorSwapCompletion(swap.order.orderHash);
    }
    console.log(`📂 Restored ${activeSwaps.length} active swaps`);
  }

  private monitorSwapCompletion(orderHash: string): void {
    console.log(`👀 Monitoring completion for ${orderHash}`);

    const checkCompletion = async () => {
      const swap = this.activeSwaps.get(orderHash);
      if (!swap) return;

      try {
        // Check if secret has been revealed on either chain
        const revealedSecret = await this.secretManager.checkSecretRevealed(orderHash);

        if (revealedSecret) {
          console.log(`🔓 Secret revealed for ${orderHash}`);
          await this.completeSwap(orderHash, revealedSecret);
        } else if (Date.now() > swap.order.deadline) {
          console.log(`⏰ Swap ${orderHash} expired, initiating refund`);
          await this.refundManager.initiateRefund(orderHash, swap);
        }
      } catch (error) {
        console.error(`Error monitoring ${orderHash}:`, error);
      }
    };

    // Check every 30 seconds
    const interval = setInterval(checkCompletion, 30000);

    // Store interval for cleanup
    if (!this.activeSwaps.get(orderHash)) return;
    (this.activeSwaps.get(orderHash) as any).monitorInterval = interval;
  }

  private async completeSwap(orderHash: string, secret: string): Promise<void> {
    console.log(`✅ Completing swap ${orderHash}`);

    try {
      const swap = this.activeSwaps.get(orderHash);
      if (!swap) return;

      // Claim funds on both chains
      await this.evmBuilder.claimFunds(swap.order, secret);
      await this.cardanoBuilder.claimFunds(swap.order, secret);

      // Update status
      await this.database.updateSwap(orderHash, {
        status: 'completed',
        updatedAt: new Date()
      });

      // Cleanup
      this.cleanupSwap(orderHash);

      this.emit('swapCompleted', { orderHash, swap });
    } catch (error) {
      console.error(`Error completing swap ${orderHash}:`, error);
    }
  }

  private startMonitoring(): void {
    // Periodic health checks and timelock monitoring
    setInterval(() => {
      this.checkTimeouts();
    }, 60000); // Every minute
  }

  private checkTimeouts(): void {
    for (const [orderHash, swap] of this.activeSwaps) {
      const hoursElapsed = (Date.now() - swap.createdAt.getTime()) / (1000 * 60 * 60);

      if (hoursElapsed > this.config.refundTimeoutHours && swap.status !== 'completed') {
        console.log(`⏰ Swap ${orderHash} timed out, initiating refund`);
        this.refundManager.initiateRefund(orderHash, swap);
      }
    }
  }

  private async cancelSwap(orderHash: string): Promise<void> {
    console.log(`🚫 Cancelling swap ${orderHash}`);

    try {
      const swap = this.activeSwaps.get(orderHash);
      if (!swap) return;

      // Cancel escrows on both chains
      if (swap.evmTx) {
        await this.evmBuilder.cancelEscrow(swap.order);
      }
      if (swap.cardanoTx) {
        await this.cardanoBuilder.cancelEscrow(swap.order);
      }

      await this.database.updateSwap(orderHash, {
        status: 'cancelled',
        updatedAt: new Date()
      });

      this.cleanupSwap(orderHash);

      this.emit('swapCancelled', { orderHash, swap });
    } catch (error) {
      console.error(`Error cancelling swap ${orderHash}:`, error);
    }
  }

  private cleanupSwap(orderHash: string): void {
    const swap = this.activeSwaps.get(orderHash);
    if (swap && (swap as any).monitorInterval) {
      clearInterval((swap as any).monitorInterval);
    }
    this.activeSwaps.delete(orderHash);
  }

  public async getSwapStatus(orderHash: string): Promise<SwapState | null> {
    return await this.database.getSwap(orderHash);
  }

  public getActiveSwapsCount(): number {
    return this.activeSwaps.size;
  }
}

export default CardanoResolver;
export { SwapState, FusionOrder, ResolverConfig };