/**
 * State Manager for Cross-Chain Order Tracking
 *
 * Manages order lifecycle and state transitions across EVM and Cardano chains:
 * - Tracks order status and progress
 * - Manages timelock deadlines
 * - Provides real-time status updates
 * - Handles error states and recovery
 */

import { EventEmitter } from 'events';
import { createLogger } from 'winston';

const logger = createLogger({
  level: 'info',
  format: require('winston').format.json(),
  transports: [
    new require('winston').transports.Console()
  ]
});

export type OrderStatus =
  | 'pending'           // Order created, waiting for deployment
  | 'evm_deployed'      // EVM escrow deployed
  | 'cardano_deploying' // Cardano escrow being deployed
  | 'cardano_deployed'  // Both escrows deployed
  | 'withdrawing'       // Secret revealed, withdrawals in progress
  | 'completed'         // All withdrawals completed
  | 'cancelling'        // Cancellation in progress
  | 'cancelled'         // Order cancelled
  | 'expired'           // Order expired due to timelock
  | 'error';            // Error state requiring intervention

export type TimelockStage =
  | 'deployment'        // Initial deployment period
  | 'private_withdrawal'// Private withdrawal period (resolver only)
  | 'public_withdrawal' // Public withdrawal period (anyone)
  | 'cancellation'      // Cancellation period
  | 'expired';          // All periods expired

export interface OrderDetails {
  orderHash: string;
  status: OrderStatus;
  srcChainId: number;
  dstChainId: number;
  maker: string;
  taker: string;
  amount: bigint;
  hashlock: string;
  secret?: string;

  // Timing information
  createdAt: number;
  deploymentTimestamp?: number;
  lastUpdated: number;

  // Timelock deadlines
  timelocks: {
    srcWithdrawal: number;
    srcPublicWithdrawal: number;
    srcCancellation: number;
    dstWithdrawal: number;
    dstPublicWithdrawal: number;
    dstCancellation: number;
  };

  // Transaction hashes
  evmTxHash?: string;
  cardanoTxHash?: string;
  withdrawalTxHash?: string;
  cancellationTxHash?: string;

  // Error tracking
  errors: Array<{
    timestamp: number;
    message: string;
    code?: string;
  }>;

  // Retry information
  retryCount: number;
  maxRetries: number;
}

export interface StateManagerConfig {
  cleanupInterval: number; // Cleanup interval in ms
  maxOrderAge: number;     // Max age before cleanup in ms
  timeCheckInterval: number; // Timelock check interval in ms
}

/**
 * StateManager handles cross-chain order state tracking and lifecycle management
 */
export class StateManager extends EventEmitter {
  private orders = new Map<string, OrderDetails>();
  private config: StateManagerConfig;
  private cleanupTimer?: NodeJS.Timer;
  private timelockTimer?: NodeJS.Timer;
  private isRunning = false;

  constructor(config?: Partial<StateManagerConfig>) {
    super();

    this.config = {
      cleanupInterval: 60 * 60 * 1000, // 1 hour
      maxOrderAge: 24 * 60 * 60 * 1000, // 24 hours
      timeCheckInterval: 60 * 1000, // 1 minute
      ...config
    };
  }

  /**
   * Start the state manager
   */
  async start(): Promise<void> {
    logger.info('📊 Starting State Manager...');

    this.isRunning = true;

    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredOrders();
    }, this.config.cleanupInterval);

    // Start timelock monitoring
    this.timelockTimer = setInterval(() => {
      this.checkTimelocks();
    }, this.config.timeCheckInterval);

    logger.info('✅ State Manager started');
  }

  /**
   * Stop the state manager
   */
  async stop(): Promise<void> {
    logger.info('🛑 Stopping State Manager...');

    this.isRunning = false;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    if (this.timelockTimer) {
      clearInterval(this.timelockTimer);
    }

    logger.info('✅ State Manager stopped');
  }

  /**
   * Add new order to tracking
   */
  addOrder(orderDetails: Partial<OrderDetails> & {
    orderHash: string;
    srcChainId: number;
    dstChainId: number;
  }): void {
    const order: OrderDetails = {
      status: 'pending',
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      errors: [],
      retryCount: 0,
      maxRetries: 3,
      maker: '',
      taker: '',
      amount: BigInt(0),
      hashlock: '',
      timelocks: {
        srcWithdrawal: 0,
        srcPublicWithdrawal: 0,
        srcCancellation: 0,
        dstWithdrawal: 0,
        dstPublicWithdrawal: 0,
        dstCancellation: 0,
      },
      ...orderDetails
    };

    this.orders.set(order.orderHash, order);
    logger.info(`📝 Added order to tracking: ${order.orderHash}`);

    this.emit('orderAdded', order);
  }

  /**
   * Update order status
   */
  updateOrderStatus(orderHash: string, status: OrderStatus, metadata?: Record<string, any>): void {
    const order = this.orders.get(orderHash);
    if (!order) {
      logger.warn(`⚠️ Attempted to update unknown order: ${orderHash}`);
      return;
    }

    const previousStatus = order.status;
    order.status = status;
    order.lastUpdated = Date.now();

    // Update metadata if provided
    if (metadata) {
      Object.assign(order, metadata);
    }

    // Handle status-specific logic
    switch (status) {
      case 'evm_deployed':
        order.deploymentTimestamp = Date.now();
        break;

      case 'error':
        order.retryCount++;
        if (metadata?.error) {
          order.errors.push({
            timestamp: Date.now(),
            message: metadata.error.message || 'Unknown error',
            code: metadata.error.code
          });
        }
        break;

      case 'completed':
      case 'cancelled':
        // Final states
        break;
    }

    this.orders.set(orderHash, order);

    logger.info(`📊 Order status updated: ${orderHash} (${previousStatus} → ${status})`);

    this.emit('orderStatusChanged', {
      orderHash,
      previousStatus,
      status,
      order
    });
  }

  /**
   * Get order details
   */
  getOrder(orderHash: string): OrderDetails | undefined {
    return this.orders.get(orderHash);
  }

  /**
   * Get all orders with optional filtering
   */
  getOrders(filter?: {
    status?: OrderStatus;
    srcChainId?: number;
    dstChainId?: number;
    maker?: string;
  }): OrderDetails[] {
    let orders = Array.from(this.orders.values());

    if (filter) {
      if (filter.status) {
        orders = orders.filter(o => o.status === filter.status);
      }
      if (filter.srcChainId) {
        orders = orders.filter(o => o.srcChainId === filter.srcChainId);
      }
      if (filter.dstChainId) {
        orders = orders.filter(o => o.dstChainId === filter.dstChainId);
      }
      if (filter.maker) {
        orders = orders.filter(o => o.maker === filter.maker);
      }
    }

    return orders;
  }

  /**
   * Remove order from tracking
   */
  removeOrder(orderHash: string): boolean {
    const removed = this.orders.delete(orderHash);
    if (removed) {
      logger.info(`🗑️ Removed order from tracking: ${orderHash}`);
      this.emit('orderRemoved', { orderHash });
    }
    return removed;
  }

  /**
   * Get current timelock stage for an order
   */
  getTimelockStage(orderHash: string): TimelockStage | null {
    const order = this.orders.get(orderHash);
    if (!order || !order.deploymentTimestamp) {
      return null;
    }

    const now = Date.now();
    const { timelocks } = order;

    // Check stages in chronological order
    if (now < timelocks.srcWithdrawal || now < timelocks.dstWithdrawal) {
      return 'deployment';
    } else if (now < timelocks.srcPublicWithdrawal || now < timelocks.dstPublicWithdrawal) {
      return 'private_withdrawal';
    } else if (now < timelocks.srcCancellation || now < timelocks.dstCancellation) {
      return 'public_withdrawal';
    } else {
      return 'cancellation';
    }
  }

  /**
   * Check if order can be cancelled
   */
  canCancel(orderHash: string): boolean {
    const stage = this.getTimelockStage(orderHash);
    const order = this.orders.get(orderHash);

    return stage === 'cancellation' &&
           order !== undefined &&
           ['evm_deployed', 'cardano_deployed', 'error'].includes(order.status);
  }

  /**
   * Check if order can be withdrawn
   */
  canWithdraw(orderHash: string): boolean {
    const stage = this.getTimelockStage(orderHash);
    const order = this.orders.get(orderHash);

    return (stage === 'private_withdrawal' || stage === 'public_withdrawal') &&
           order !== undefined &&
           order.status === 'cardano_deployed' &&
           order.secret !== undefined;
  }

  /**
   * Get order statistics
   */
  getStatistics(): {
    total: number;
    byStatus: Record<OrderStatus, number>;
    byChain: Record<string, number>;
    avgCompletionTime: number;
  } {
    const orders = Array.from(this.orders.values());

    const byStatus = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<OrderStatus, number>);

    const byChain = orders.reduce((acc, order) => {
      const key = `${order.srcChainId}->${order.dstChainId}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const completedOrders = orders.filter(o => o.status === 'completed');
    const avgCompletionTime = completedOrders.length > 0
      ? completedOrders.reduce((sum, order) => sum + (order.lastUpdated - order.createdAt), 0) / completedOrders.length
      : 0;

    return {
      total: orders.length,
      byStatus,
      byChain,
      avgCompletionTime
    };
  }

  /**
   * Periodic cleanup of expired orders
   */
  private cleanupExpiredOrders(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [orderHash, order] of this.orders) {
      // Remove completed/cancelled orders after max age
      if (['completed', 'cancelled', 'expired'].includes(order.status) &&
          now - order.lastUpdated > this.config.maxOrderAge) {
        toRemove.push(orderHash);
      }

      // Remove failed orders with max retries exceeded
      if (order.status === 'error' && order.retryCount >= order.maxRetries &&
          now - order.lastUpdated > this.config.maxOrderAge) {
        toRemove.push(orderHash);
      }
    }

    for (const orderHash of toRemove) {
      this.removeOrder(orderHash);
    }

    if (toRemove.length > 0) {
      logger.info(`🧹 Cleaned up ${toRemove.length} expired orders`);
    }
  }

  /**
   * Check timelock deadlines and emit events
   */
  private checkTimelocks(): void {
    const now = Date.now();

    for (const [orderHash, order] of this.orders) {
      if (!order.deploymentTimestamp) continue;

      const stage = this.getTimelockStage(orderHash);

      // Check for timelock expiration
      if (stage === 'cancellation' &&
          now > Math.max(order.timelocks.srcCancellation, order.timelocks.dstCancellation) &&
          !['completed', 'cancelled', 'expired'].includes(order.status)) {

        this.updateOrderStatus(orderHash, 'expired');
        this.emit('timelockExpired', { orderHash, order });
      }

      // Emit stage transition events
      this.emit('timelockStage', { orderHash, stage, order });
    }
  }
}

export default StateManager;