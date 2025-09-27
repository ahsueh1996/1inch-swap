import { SwapRegistry } from '../database';
import { RelayerConfig, SwapRecord } from '../types';
import { EventEmitter } from 'events';
import cron from 'node-cron';

export interface TimeoutAlert {
  orderId: string;
  alertType: 'user_deadline_approaching' | 'cancel_deadline_approaching' | 'deadline_passed';
  deadline: number;
  currentTime: number;
  timeRemaining: number;
}

export class TimeoutMonitor extends EventEmitter {
  private cronJob: cron.ScheduledTask | null = null;
  private alertBuffer = 300;

  constructor(
    private registry: SwapRegistry,
    private config: RelayerConfig
  ) {
    super();
  }

  start(): void {
    if (this.cronJob) {
      return;
    }

    console.log('Starting timeout monitor...');

    this.cronJob = cron.schedule('*/30 * * * * *', () => {
      this.checkTimeouts().catch(error => {
        console.error('Error during timeout check:', error);
      });
    });

    this.checkTimeouts();
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('Timeout monitor stopped');
    }
  }

  private async checkTimeouts(): Promise<void> {
    try {
      await this.checkApproachingDeadlines();
      await this.checkPastDeadlines();
      await this.handleCancellations();
    } catch (error) {
      console.error('Error during timeout monitoring:', error);
    }
  }

  private async checkApproachingDeadlines(): Promise<void> {
    const activeSwaps = await this.registry.getActiveSwaps();
    const now = Math.floor(Date.now() / 1000);

    for (const swap of activeSwaps) {
      const userTimeRemaining = swap.params.userDeadline - now;
      const cancelTimeRemaining = swap.params.cancelAfter - now;

      if (userTimeRemaining <= this.alertBuffer && userTimeRemaining > 0) {
        this.emitTimeoutAlert(swap, 'user_deadline_approaching', swap.params.userDeadline);
      }

      if (cancelTimeRemaining <= this.alertBuffer && cancelTimeRemaining > 0) {
        this.emitTimeoutAlert(swap, 'cancel_deadline_approaching', swap.params.cancelAfter);
      }
    }
  }

  private async checkPastDeadlines(): Promise<void> {
    const userExpiredSwaps = await this.registry.getSwapsPastUserDeadline();
    const cancelExpiredSwaps = await this.registry.getSwapsPastCancelDeadline();

    for (const swap of userExpiredSwaps) {
      this.emitTimeoutAlert(swap, 'deadline_passed', swap.params.userDeadline);

      if (swap.secret) {
        console.log(`User deadline passed for ${swap.orderId} - secret should be revealed`);
        this.emit('secretRevealRequired', {
          orderId: swap.orderId,
          reason: 'user_deadline_passed',
          urgency: 'high'
        });
      }
    }

    for (const swap of cancelExpiredSwaps) {
      console.log(`Cancel deadline passed for ${swap.orderId} - triggering public cancel`);
      await this.triggerPublicCancel(swap);
    }
  }

  private async handleCancellations(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const activeSwaps = await this.registry.getActiveSwaps();

    for (const swap of activeSwaps) {
      if (now > swap.params.cancelAfter) {
        await this.registry.updateSwapStatus(swap.orderId, 'expired');

        this.emit('swapExpired', {
          orderId: swap.orderId,
          reason: 'cancel_deadline_passed',
          timestamp: Date.now()
        });
      }
    }
  }

  private async triggerPublicCancel(swap: SwapRecord): Promise<void> {
    try {
      await this.registry.updateSwapStatus(swap.orderId, 'cancelled');

      this.emit('publicCancelRequired', {
        orderId: swap.orderId,
        swap,
        reason: 'timeout',
        timestamp: Date.now()
      });

      console.log(`Public cancel triggered for swap ${swap.orderId}`);
    } catch (error) {
      console.error(`Failed to trigger public cancel for ${swap.orderId}:`, error);
    }
  }

  private emitTimeoutAlert(
    swap: SwapRecord,
    alertType: TimeoutAlert['alertType'],
    deadline: number
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = deadline - now;

    const alert: TimeoutAlert = {
      orderId: swap.orderId,
      alertType,
      deadline,
      currentTime: now,
      timeRemaining
    };

    this.emit('timeoutAlert', alert);

    if (timeRemaining <= 0) {
      console.warn(`Deadline PASSED for ${swap.orderId}: ${alertType}`);
    } else {
      console.warn(`Deadline APPROACHING for ${swap.orderId}: ${alertType} in ${timeRemaining}s`);
    }
  }

  async getUpcomingDeadlines(windowSeconds: number = 3600): Promise<TimeoutAlert[]> {
    const activeSwaps = await this.registry.getActiveSwaps();
    const now = Math.floor(Date.now() / 1000);
    const alerts: TimeoutAlert[] = [];

    for (const swap of activeSwaps) {
      const userTimeRemaining = swap.params.userDeadline - now;
      const cancelTimeRemaining = swap.params.cancelAfter - now;

      if (userTimeRemaining <= windowSeconds && userTimeRemaining > 0) {
        alerts.push({
          orderId: swap.orderId,
          alertType: 'user_deadline_approaching',
          deadline: swap.params.userDeadline,
          currentTime: now,
          timeRemaining: userTimeRemaining
        });
      }

      if (cancelTimeRemaining <= windowSeconds && cancelTimeRemaining > 0) {
        alerts.push({
          orderId: swap.orderId,
          alertType: 'cancel_deadline_approaching',
          deadline: swap.params.cancelAfter,
          currentTime: now,
          timeRemaining: cancelTimeRemaining
        });
      }
    }

    return alerts.sort((a, b) => a.timeRemaining - b.timeRemaining);
  }

  async extendDeadline(
    orderId: string,
    newUserDeadline: number,
    newCancelAfter: number
  ): Promise<void> {
    const swap = await this.registry.getSwap(orderId);
    if (!swap) {
      throw new Error(`Swap not found: ${orderId}`);
    }

    const now = Math.floor(Date.now() / 1000);

    if (newUserDeadline <= now) {
      throw new Error('New user deadline must be in the future');
    }

    if (newCancelAfter <= newUserDeadline) {
      throw new Error('Cancel deadline must be after user deadline');
    }

    swap.params.userDeadline = newUserDeadline;
    swap.params.cancelAfter = newCancelAfter;

    console.log(`Extended deadlines for ${orderId}: user=${newUserDeadline}, cancel=${newCancelAfter}`);

    this.emit('deadlineExtended', {
      orderId,
      newUserDeadline,
      newCancelAfter,
      timestamp: Date.now()
    });
  }

  async cleanup(): Promise<void> {
    this.stop();
    this.removeAllListeners();
  }
}