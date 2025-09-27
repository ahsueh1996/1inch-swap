import { SwapRegistry } from '../database/index.js';
import { ParameterValidator } from './validator.js';
import { RelayerConfig } from '../types/index.js';
import { EventEmitter } from 'events';

export interface SecretRequest {
  orderId: string;
  hashlock: string;
  deadline: number;
}

export interface SecretResponse {
  orderId: string;
  secret: string;
  timestamp: number;
}

export class SecretMediator extends EventEmitter {
  private pendingSecretRequests = new Map<string, SecretRequest>();
  private secretQueue = new Map<string, string>();

  constructor(
    private registry: SwapRegistry,
    private validator: ParameterValidator,
    private config: RelayerConfig
  ) {
    super();
  }

  async requestSecret(orderId: string): Promise<void> {
    const swap = await this.registry.getSwap(orderId);
    if (!swap) {
      throw new Error(`Swap not found: ${orderId}`);
    }

    if (swap.status !== 'pending') {
      throw new Error(`Invalid swap status for secret request: ${swap.status}`);
    }

    const request: SecretRequest = {
      orderId,
      hashlock: swap.params.hashlock,
      deadline: swap.params.userDeadline
    };

    this.pendingSecretRequests.set(orderId, request);
    await this.registry.updateSwapStatus(orderId, 'awaiting_secret');

    this.emit('secretRequested', request);

    console.log(`Secret requested for order ${orderId}, hashlock: ${request.hashlock}`);
  }

  async provideSecret(orderId: string, secret: string): Promise<void> {
    const swap = await this.registry.getSwap(orderId);
    if (!swap) {
      throw new Error(`Swap not found: ${orderId}`);
    }

    if (swap.status !== 'awaiting_secret') {
      throw new Error(`Invalid swap status for secret provision: ${swap.status}`);
    }

    if (!this.validator.validateSecret(secret, swap.params.hashlock)) {
      throw new Error('Secret does not match hashlock');
    }

    this.secretQueue.set(orderId, secret);
    this.pendingSecretRequests.delete(orderId);

    console.log(`Secret received for order ${orderId}`);

    this.emit('secretReceived', {
      orderId,
      secret,
      timestamp: Date.now()
    } as SecretResponse);
  }

  async shareSecretWithResolver(orderId: string, resolverAddress: string): Promise<void> {
    const secret = this.secretQueue.get(orderId);
    if (!secret) {
      throw new Error(`No secret available for order ${orderId}`);
    }

    const swap = await this.registry.getSwap(orderId);
    if (!swap) {
      throw new Error(`Swap not found: ${orderId}`);
    }

    await this.registry.setSecret(orderId, secret);
    this.secretQueue.delete(orderId);

    console.log(`Secret shared with resolver ${resolverAddress} for order ${orderId}`);

    this.emit('secretShared', {
      orderId,
      resolverAddress,
      timestamp: Date.now()
    });

    this.startGracePeriod(orderId);
  }

  async forceRevealSecret(orderId: string, reason: string): Promise<void> {
    const swap = await this.registry.getSwap(orderId);
    if (!swap || !swap.secret) {
      throw new Error(`No secret to reveal for order ${orderId}`);
    }

    console.log(`Force revealing secret for order ${orderId}, reason: ${reason}`);

    this.emit('secretForceRevealed', {
      orderId,
      secret: swap.secret,
      reason,
      timestamp: Date.now()
    });

    await this.registry.updateSwapStatus(orderId, 'completed');
  }

  private startGracePeriod(orderId: string): void {
    setTimeout(async () => {
      try {
        const swap = await this.registry.getSwap(orderId);
        if (!swap) return;

        if (swap.status === 'secret_shared') {
          console.log(`Grace period expired for order ${orderId}, force revealing secret`);
          await this.forceRevealSecret(orderId, 'grace_period_expired');
        }
      } catch (error) {
        console.error(`Error handling grace period expiry for ${orderId}:`, error);
      }
    }, this.config.maxSecretHoldTime * 1000);
  }

  getPendingSecretRequests(): SecretRequest[] {
    return Array.from(this.pendingSecretRequests.values());
  }

  hasSecretForOrder(orderId: string): boolean {
    return this.secretQueue.has(orderId);
  }

  async processSecretQueue(): Promise<void> {
    for (const [orderId, secret] of this.secretQueue.entries()) {
      try {
        const swap = await this.registry.getSwap(orderId);
        if (!swap) {
          this.secretQueue.delete(orderId);
          continue;
        }

        if (swap.status === 'awaiting_secret') {
          console.log(`Processing queued secret for order ${orderId}`);

          this.emit('secretReadyForResolver', {
            orderId,
            secret,
            swap
          });
        }
      } catch (error) {
        console.error(`Error processing secret queue for ${orderId}:`, error);
      }
    }
  }

  async handleResolverReady(orderId: string, resolverAddress: string): Promise<void> {
    const secret = this.secretQueue.get(orderId);
    if (secret) {
      await this.shareSecretWithResolver(orderId, resolverAddress);
    } else {
      console.warn(`No secret available when resolver ${resolverAddress} is ready for order ${orderId}`);
    }
  }

  async cleanup(): Promise<void> {
    this.pendingSecretRequests.clear();
    this.secretQueue.clear();
    this.removeAllListeners();
  }
}