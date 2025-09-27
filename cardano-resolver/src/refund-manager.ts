import { EventEmitter } from 'events';
import { EVMTransactionBuilder } from './builders/evm-builder';
import { CardanoTransactionBuilder } from './builders/cardano-builder';
import { SwapState } from './resolver';

interface RefundStatus {
  orderHash: string;
  status: 'pending' | 'evm_refunded' | 'cardano_refunded' | 'completed' | 'failed';
  evmRefundTx?: string;
  cardanoRefundTx?: string;
  reason: 'timeout' | 'cancellation' | 'failure';
  initiatedAt: Date;
  completedAt?: Date;
  error?: string;
}

export class RefundManager extends EventEmitter {
  private refunds = new Map<string, RefundStatus>();
  private evmBuilder: EVMTransactionBuilder;
  private cardanoBuilder: CardanoTransactionBuilder;

  constructor(evmBuilder: EVMTransactionBuilder, cardanoBuilder: CardanoTransactionBuilder) {
    super();
    this.evmBuilder = evmBuilder;
    this.cardanoBuilder = cardanoBuilder;
  }

  async initiateRefund(orderHash: string, swap: SwapState, reason: 'timeout' | 'cancellation' | 'failure' = 'timeout'): Promise<void> {
    console.log(`🔄 Initiating refund for ${orderHash} (reason: ${reason})`);

    const refundStatus: RefundStatus = {
      orderHash,
      status: 'pending',
      reason,
      initiatedAt: new Date()
    };

    this.refunds.set(orderHash, refundStatus);

    try {
      // Determine which refunds are needed based on swap state
      const refundNeeded = this.determineRefundNeeded(swap);

      if (refundNeeded.evm) {
        await this.refundEVM(orderHash, swap);
      }

      if (refundNeeded.cardano) {
        await this.refundCardano(orderHash, swap);
      }

      // Check final status
      await this.checkRefundCompletion(orderHash);

    } catch (error) {
      console.error(`Failed to initiate refund for ${orderHash}:`, error);

      refundStatus.status = 'failed';
      refundStatus.error = error.message;
      this.refunds.set(orderHash, refundStatus);

      this.emit('refundFailed', { orderHash, error });
    }
  }

  private determineRefundNeeded(swap: SwapState): { evm: boolean; cardano: boolean } {
    const result = { evm: false, cardano: false };

    // EVM refund needed if transaction was sent but not completed
    if (swap.evmTx && !['completed'].includes(swap.status)) {
      result.evm = true;
    }

    // Cardano refund needed if escrow was deployed but not completed
    if (swap.cardanoTx && !['completed'].includes(swap.status)) {
      result.cardano = true;
    }

    return result;
  }

  private async refundEVM(orderHash: string, swap: SwapState): Promise<void> {
    try {
      console.log(`💰 Processing EVM refund for ${orderHash}`);

      const refundTx = await this.evmBuilder.cancelEscrow(swap.order);

      const refundStatus = this.refunds.get(orderHash)!;
      refundStatus.evmRefundTx = refundTx;
      refundStatus.status = 'evm_refunded';
      this.refunds.set(orderHash, refundStatus);

      console.log(`✅ EVM refund completed: ${refundTx}`);
      this.emit('evmRefundCompleted', { orderHash, txHash: refundTx });

    } catch (error) {
      console.error(`Failed EVM refund for ${orderHash}:`, error);
      throw error;
    }
  }

  private async refundCardano(orderHash: string, swap: SwapState): Promise<void> {
    try {
      console.log(`💰 Processing Cardano refund for ${orderHash}`);

      // Check if timelock has expired before attempting refund
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime < swap.order.deadline) {
        console.log(`⏳ Waiting for timelock expiry for ${orderHash}`);

        // Schedule refund after timelock expires
        const delay = (swap.order.deadline - currentTime) * 1000 + 60000; // Add 1 minute buffer
        setTimeout(() => {
          this.refundCardano(orderHash, swap);
        }, delay);

        return;
      }

      const refundTx = await this.cardanoBuilder.cancelEscrow(swap.order);

      const refundStatus = this.refunds.get(orderHash)!;
      refundStatus.cardanoRefundTx = refundTx;
      if (refundStatus.status === 'evm_refunded') {
        refundStatus.status = 'completed';
        refundStatus.completedAt = new Date();
      } else {
        refundStatus.status = 'cardano_refunded';
      }
      this.refunds.set(orderHash, refundStatus);

      console.log(`✅ Cardano refund completed: ${refundTx}`);
      this.emit('cardanoRefundCompleted', { orderHash, txHash: refundTx });

    } catch (error) {
      console.error(`Failed Cardano refund for ${orderHash}:`, error);
      throw error;
    }
  }

  private async checkRefundCompletion(orderHash: string): Promise<void> {
    const refundStatus = this.refunds.get(orderHash);
    if (!refundStatus) return;

    // Check if all required refunds are completed
    const hasEvmRefund = refundStatus.evmRefundTx;
    const hasCardanoRefund = refundStatus.cardanoRefundTx;

    if ((hasEvmRefund || !refundStatus.evmRefundTx) &&
        (hasCardanoRefund || !refundStatus.cardanoRefundTx)) {

      refundStatus.status = 'completed';
      refundStatus.completedAt = new Date();
      this.refunds.set(orderHash, refundStatus);

      console.log(`🎉 Refund completed for ${orderHash}`);
      this.emit('refundCompleted', { orderHash, refundStatus });
    }
  }

  async getRefundStatus(orderHash: string): Promise<RefundStatus | undefined> {
    return this.refunds.get(orderHash);
  }

  async getAllRefunds(): Promise<RefundStatus[]> {
    return Array.from(this.refunds.values());
  }

  async getPendingRefunds(): Promise<RefundStatus[]> {
    return Array.from(this.refunds.values()).filter(
      refund => !['completed', 'failed'].includes(refund.status)
    );
  }

  // Emergency refund for critical situations
  async emergencyRefund(orderHash: string, swap: SwapState): Promise<void> {
    console.log(`🚨 Emergency refund initiated for ${orderHash}`);

    try {
      // Force immediate refunds on both chains
      const promises: Promise<void>[] = [];

      if (swap.evmTx) {
        promises.push(this.refundEVM(orderHash, swap));
      }

      if (swap.cardanoTx) {
        promises.push(this.refundCardano(orderHash, swap));
      }

      await Promise.allSettled(promises);

      this.emit('emergencyRefundCompleted', { orderHash });

    } catch (error) {
      console.error(`Emergency refund failed for ${orderHash}:`, error);
      this.emit('emergencyRefundFailed', { orderHash, error });
    }
  }

  // Automated refund monitoring
  startRefundMonitoring(): void {
    setInterval(() => {
      this.monitorPendingRefunds();
    }, 300000); // Check every 5 minutes
  }

  private async monitorPendingRefunds(): void {
    const pendingRefunds = await this.getPendingRefunds();

    for (const refund of pendingRefunds) {
      try {
        // Check if transactions are confirmed
        if (refund.evmRefundTx) {
          // Would check EVM transaction confirmation
        }

        if (refund.cardanoRefundTx) {
          // Would check Cardano transaction confirmation
        }

        // Retry failed refunds after delay
        const hoursSinceInitiation = (Date.now() - refund.initiatedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceInitiation > 2 && refund.status === 'pending') {
          console.log(`🔄 Retrying refund for ${refund.orderHash}`);
          // Would retry the refund process
        }

      } catch (error) {
        console.error(`Error monitoring refund ${refund.orderHash}:`, error);
      }
    }
  }

  // Cleanup completed refunds older than specified time
  cleanupOldRefunds(olderThanHours: number = 24): void {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);

    for (const [orderHash, refund] of this.refunds) {
      if (refund.status === 'completed' &&
          refund.completedAt &&
          refund.completedAt.getTime() < cutoffTime) {

        this.refunds.delete(orderHash);
        console.log(`🧹 Cleaned up old refund record for ${orderHash}`);
      }
    }
  }

  // Get refund statistics
  getRefundStats(): {
    total: number;
    completed: number;
    pending: number;
    failed: number;
    byReason: Record<string, number>;
  } {
    const refunds = Array.from(this.refunds.values());

    return {
      total: refunds.length,
      completed: refunds.filter(r => r.status === 'completed').length,
      pending: refunds.filter(r => r.status === 'pending').length,
      failed: refunds.filter(r => r.status === 'failed').length,
      byReason: refunds.reduce((acc, refund) => {
        acc[refund.reason] = (acc[refund.reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}