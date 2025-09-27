import { SwapRegistry } from '../database';
import { RelayerConfig, SwapRecord } from '../types';
import { EventEmitter } from 'events';
import axios from 'axios';

export interface PublicSecretReveal {
  orderId: string;
  secret: string;
  reason: string;
  timestamp: number;
  ipfsHash?: string;
  broadcastTxId?: string;
}

export class LivenessEnforcer extends EventEmitter {
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private registry: SwapRegistry,
    private config: RelayerConfig
  ) {
    super();
  }

  start(): void {
    if (this.monitoringInterval) {
      return;
    }

    console.log('Starting liveness enforcer...');

    this.monitoringInterval = setInterval(
      () => this.checkLiveness(),
      this.config.pollInterval
    );

    this.checkLiveness();
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Liveness enforcer stopped');
    }
  }

  private async checkLiveness(): Promise<void> {
    try {
      await this.checkExpiredGracePeriods();
      await this.checkUserDeadlines();
    } catch (error) {
      console.error('Error during liveness check:', error);
    }
  }

  private async checkExpiredGracePeriods(): Promise<void> {
    const expiredSwaps = await this.registry.getSwapsWithExpiredGrace(
      this.config.maxSecretHoldTime
    );

    for (const swap of expiredSwaps) {
      if (swap.secret) {
        await this.publishSecretPublicly(
          swap,
          'grace_period_expired',
          `Resolver failed to complete swap within ${this.config.maxSecretHoldTime}s grace period`
        );
      }
    }
  }

  private async checkUserDeadlines(): Promise<void> {
    const expiredSwaps = await this.registry.getSwapsPastUserDeadline();

    for (const swap of expiredSwaps) {
      if (swap.secret) {
        await this.publishSecretPublicly(
          swap,
          'user_deadline_passed',
          'User deadline has passed, emergency secret reveal'
        );
      } else {
        console.log(`Swap ${swap.orderId} past user deadline but no secret available`);
      }
    }
  }

  async publishSecretPublicly(
    swap: SwapRecord,
    reason: string,
    description: string
  ): Promise<PublicSecretReveal> {
    if (!swap.secret) {
      throw new Error(`No secret available for swap ${swap.orderId}`);
    }

    console.log(`Publishing secret publicly for ${swap.orderId}: ${description}`);

    const reveal: PublicSecretReveal = {
      orderId: swap.orderId,
      secret: swap.secret,
      reason,
      timestamp: Date.now()
    };

    try {
      if (this.config.ipfsGateway) {
        reveal.ipfsHash = await this.publishToIPFS(reveal);
      }

      reveal.broadcastTxId = await this.broadcastSecret(swap);

      await this.registry.updateSwapStatus(swap.orderId, 'completed');

      this.emit('secretPublishedPublicly', reveal);

      console.log(`Secret published publicly for ${swap.orderId}:`, {
        ipfsHash: reveal.ipfsHash,
        broadcastTxId: reveal.broadcastTxId
      });

      return reveal;

    } catch (error) {
      console.error(`Failed to publish secret for ${swap.orderId}:`, error);
      throw error;
    }
  }

  private async publishToIPFS(reveal: PublicSecretReveal): Promise<string> {
    if (!this.config.ipfsGateway || !this.config.ipfsProjectId) {
      throw new Error('IPFS configuration not available');
    }

    const ipfsData = {
      orderId: reveal.orderId,
      secret: reveal.secret,
      reason: reveal.reason,
      timestamp: reveal.timestamp,
      signature: 'relayer_v1.0',
      metadata: {
        publisher: 'cardano-relayer',
        version: '1.0.0'
      }
    };

    try {
      const response = await axios.post(
        `${this.config.ipfsGateway}/api/v0/add`,
        JSON.stringify(ipfsData),
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(
              `${this.config.ipfsProjectId}:${this.config.ipfsProjectSecret}`
            ).toString('base64')}`
          }
        }
      );

      return response.data.Hash;
    } catch (error) {
      console.error('Failed to publish to IPFS:', error);
      throw new Error('IPFS publication failed');
    }
  }

  private async broadcastSecret(swap: SwapRecord): Promise<string> {
    const broadcastData = {
      type: 'SECRET_REVEAL',
      orderId: swap.orderId,
      secret: swap.secret,
      hashlock: swap.params.hashlock,
      chains: {
        src: swap.params.chainIdSrc,
        dst: swap.params.chainIdDst
      },
      timestamp: Date.now()
    };

    this.emit('secretBroadcast', broadcastData);

    return `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async forcePublishSecret(
    orderId: string,
    reason: string
  ): Promise<PublicSecretReveal> {
    const swap = await this.registry.getSwap(orderId);
    if (!swap) {
      throw new Error(`Swap not found: ${orderId}`);
    }

    if (!swap.secret) {
      throw new Error(`No secret available for swap ${orderId}`);
    }

    return this.publishSecretPublicly(swap, reason, 'Manual force publication');
  }

  async getPublicationHistory(): Promise<PublicSecretReveal[]> {
    return [];
  }

  async cleanup(): Promise<void> {
    this.stop();
    this.removeAllListeners();
  }
}