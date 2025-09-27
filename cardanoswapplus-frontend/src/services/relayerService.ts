import axios, { AxiosInstance } from 'axios';
import { BigNumber } from 'bignumber.js';

import {
  SwapOrder,
  SwapStatus,
  SwapParams,
  SwapQuote,
  Token,
  Chain,
  RelayerStatus,
  SwapProgress
} from '@/types/swap';

interface RelayerSwapRequest {
  fromChain: Chain;
  toChain: Chain;
  fromToken: Token;
  toToken: Token;
  amount: string;
  fromAddress: string;
  toAddress: string;
  slippage: number;
  deadline: number;
  orderHash?: string;
}

interface RelayerSwapResponse {
  orderId: string;
  orderHash: string;
  status: string;
  escrowAddresses: {
    source?: string;
    destination?: string;
  };
  secretHash: string;
  estimatedCompletionTime: number;
  fees: {
    relayerFee: string;
    networkFees: {
      source: string;
      destination: string;
    };
  };
}

interface RelayerOrderStatus {
  orderId: string;
  status: string;
  progress: {
    step: number;
    totalSteps: number;
    currentAction: string;
    estimatedTimeRemaining: number;
  };
  transactions: {
    sourceChain?: {
      txHash: string;
      status: 'pending' | 'confirmed' | 'failed';
      confirmations: number;
      requiredConfirmations: number;
    };
    destinationChain?: {
      txHash: string;
      status: 'pending' | 'confirmed' | 'failed';
      confirmations: number;
      requiredConfirmations: number;
    };
  };
  secret?: string;
  error?: string;
}

interface RelayerQuoteRequest {
  fromChain: Chain;
  toChain: Chain;
  fromToken: Token;
  toToken: Token;
  amount: string;
}

interface RelayerQuoteResponse {
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  priceImpact: string;
  fees: {
    relayerFee: string;
    networkFees: {
      source: string;
      destination: string;
    };
    protocolFee: string;
  };
  estimatedTime: number;
  route: Array<{
    protocol: string;
    percentage: number;
  }>;
  validUntil: number;
}

class RelayerService {
  private apiClient: AxiosInstance;
  private wsConnection: WebSocket | null = null;
  private eventListeners: Map<string, Function[]> = new Map();

  constructor() {
    const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';

    this.apiClient = axios.create({
      baseURL: relayerUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    this.initializeWebSocket();
  }

  private initializeWebSocket() {
    try {
      const wsUrl = process.env.NEXT_PUBLIC_RELAYER_WS_URL || 'ws://localhost:3001/ws';
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onopen = () => {
        console.log('Connected to relayer WebSocket');
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.wsConnection.onclose = () => {
        console.log('Disconnected from relayer WebSocket');
        // Attempt to reconnect after 5 seconds
        setTimeout(() => this.initializeWebSocket(), 5000);
      };

      this.wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
    }
  }

  private handleWebSocketMessage(data: any) {
    const { type, payload } = data;

    switch (type) {
      case 'swap_status_update':
        this.emit('swapStatusUpdate', payload);
        break;
      case 'swap_completed':
        this.emit('swapCompleted', payload);
        break;
      case 'swap_failed':
        this.emit('swapFailed', payload);
        break;
      case 'relayer_status':
        this.emit('relayerStatus', payload);
        break;
      default:
        console.log('Unknown WebSocket message type:', type);
    }
  }

  /**
   * Subscribe to events
   */
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, callback: Function) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit events
   */
  private emit(event: string, data: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * Get quote from relayer
   */
  async getQuote(params: SwapParams): Promise<SwapQuote> {
    try {
      const quoteRequest: RelayerQuoteRequest = {
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount.toString(),
      };

      const response = await this.apiClient.post<RelayerQuoteResponse>('/quote', quoteRequest);
      const data = response.data;

      return {
        fromAmount: new BigNumber(data.fromAmount),
        toAmount: new BigNumber(data.toAmount),
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromChain: params.fromChain,
        toChain: params.toChain,
        estimatedGas: new BigNumber(0), // Will be calculated by individual chains
        exchangeRate: new BigNumber(data.exchangeRate),
        priceImpact: new BigNumber(data.priceImpact),
        fees: {
          networkFee: new BigNumber(data.fees.networkFees.source).plus(
            new BigNumber(data.fees.networkFees.destination)
          ),
          protocolFee: new BigNumber(data.fees.protocolFee),
          resolverFee: new BigNumber(data.fees.relayerFee),
        },
        route: data.route.map(r => ({
          protocol: r.protocol,
          percentage: r.percentage,
          fromTokenAddress: params.fromToken.address,
          toTokenAddress: params.toToken.address,
        })),
        estimatedTime: data.estimatedTime,
        slippage: params.slippage,
      };
    } catch (error) {
      console.error('Failed to get relayer quote:', error);
      throw new Error('Failed to get relayer quote');
    }
  }

  /**
   * Submit swap order to relayer
   */
  async submitSwapOrder(
    params: SwapParams,
    fromAddress: string,
    toAddress: string
  ): Promise<SwapOrder> {
    try {
      const swapRequest: RelayerSwapRequest = {
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount.toString(),
        fromAddress,
        toAddress,
        slippage: params.slippage,
        deadline: params.deadline || Date.now() + (30 * 60 * 1000), // 30 minutes default
      };

      const response = await this.apiClient.post<RelayerSwapResponse>('/swap', swapRequest);
      const data = response.data;

      // Subscribe to updates for this order
      this.subscribeToOrder(data.orderId);

      return {
        id: data.orderId,
        orderHash: data.orderHash,
        maker: fromAddress,
        taker: toAddress,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromAmount: params.amount,
        toAmount: new BigNumber(0), // Will be updated when relayer provides final amount
        status: this.mapRelayerStatus(data.status),
        createdAt: Date.now(),
        expiresAt: data.estimatedCompletionTime,
        txHashes: {},
        secretHash: data.secretHash,
        escrowAddresses: data.escrowAddresses,
        fees: {
          networkFee: new BigNumber(data.fees.networkFees.source).plus(
            new BigNumber(data.fees.networkFees.destination)
          ),
          protocolFee: new BigNumber(0),
          resolverFee: new BigNumber(data.fees.relayerFee),
        },
      };
    } catch (error) {
      console.error('Failed to submit swap order:', error);
      throw new Error('Failed to submit swap order');
    }
  }

  /**
   * Get swap order status
   */
  async getSwapStatus(orderId: string): Promise<RelayerOrderStatus> {
    try {
      const response = await this.apiClient.get<RelayerOrderStatus>(`/swap/${orderId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get swap status:', error);
      throw new Error('Failed to get swap status');
    }
  }

  /**
   * Cancel swap order
   */
  async cancelSwap(orderId: string, reason?: string): Promise<boolean> {
    try {
      await this.apiClient.post(`/swap/${orderId}/cancel`, {
        reason: reason || 'User cancelled',
      });
      return true;
    } catch (error) {
      console.error('Failed to cancel swap:', error);
      return false;
    }
  }

  /**
   * Get relayer status and health
   */
  async getRelayerStatus(): Promise<RelayerStatus> {
    try {
      const response = await this.apiClient.get('/status');
      const data = response.data;

      return {
        isOnline: data.status === 'online',
        activeOrders: data.activeOrders || 0,
        avgProcessingTime: data.avgProcessingTime || 0,
        successRate: data.successRate || 0,
        lastSeen: Date.now(),
      };
    } catch (error) {
      console.error('Failed to get relayer status:', error);
      return {
        isOnline: false,
        activeOrders: 0,
        avgProcessingTime: 0,
        successRate: 0,
        lastSeen: 0,
      };
    }
  }

  /**
   * Get supported chains and tokens
   */
  async getSupportedAssets(): Promise<{
    chains: Chain[];
    tokens: Record<number, Token[]>;
  }> {
    try {
      const response = await this.apiClient.get('/assets');
      return response.data;
    } catch (error) {
      console.error('Failed to get supported assets:', error);
      return { chains: [], tokens: {} };
    }
  }

  /**
   * Subscribe to order updates via WebSocket
   */
  private subscribeToOrder(orderId: string) {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'subscribe',
        payload: { orderId },
      }));
    }
  }

  /**
   * Unsubscribe from order updates
   */
  unsubscribeFromOrder(orderId: string) {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'unsubscribe',
        payload: { orderId },
      }));
    }
  }

  /**
   * Get swap progress information
   */
  async getSwapProgress(orderId: string): Promise<SwapProgress[]> {
    try {
      const status = await this.getSwapStatus(orderId);

      const steps: SwapProgress[] = [
        {
          step: 1,
          totalSteps: 5,
          title: 'Order Submitted',
          description: 'Swap order submitted to relayer',
          status: 'completed',
        },
        {
          step: 2,
          totalSteps: 5,
          title: 'Source Chain Transaction',
          description: 'Deploying escrow on source chain',
          status: status.transactions.sourceChain ?
            (status.transactions.sourceChain.status === 'confirmed' ? 'completed' :
             status.transactions.sourceChain.status === 'failed' ? 'failed' : 'loading') : 'pending',
          txHash: status.transactions.sourceChain?.txHash,
        },
        {
          step: 3,
          totalSteps: 5,
          title: 'Relayer Processing',
          description: 'Relayer processing cross-chain swap',
          status: status.progress.step >= 3 ? 'completed' :
                  status.progress.step === 2 ? 'loading' : 'pending',
        },
        {
          step: 4,
          totalSteps: 5,
          title: 'Destination Chain Transaction',
          description: 'Deploying escrow on destination chain',
          status: status.transactions.destinationChain ?
            (status.transactions.destinationChain.status === 'confirmed' ? 'completed' :
             status.transactions.destinationChain.status === 'failed' ? 'failed' : 'loading') : 'pending',
          txHash: status.transactions.destinationChain?.txHash,
        },
        {
          step: 5,
          totalSteps: 5,
          title: 'Swap Completed',
          description: 'Cross-chain swap completed successfully',
          status: status.status === 'completed' ? 'completed' :
                  status.status === 'failed' ? 'failed' : 'pending',
        },
      ];

      return steps;
    } catch (error) {
      console.error('Failed to get swap progress:', error);
      return [];
    }
  }

  /**
   * Estimate swap completion time
   */
  async estimateSwapTime(fromChain: Chain, toChain: Chain): Promise<number> {
    try {
      const response = await this.apiClient.get('/estimate-time', {
        params: {
          fromChainId: fromChain.id,
          toChainId: toChain.id,
        },
      });

      return response.data.estimatedTime || 1800; // Default 30 minutes
    } catch (error) {
      console.error('Failed to estimate swap time:', error);
      return 1800; // Default 30 minutes
    }
  }

  /**
   * Map relayer status to our SwapStatus enum
   */
  private mapRelayerStatus(relayerStatus: string): SwapStatus {
    switch (relayerStatus.toLowerCase()) {
      case 'pending':
        return SwapStatus.PENDING;
      case 'processing':
        return SwapStatus.SOURCE_PENDING;
      case 'source_confirmed':
        return SwapStatus.SOURCE_CONFIRMED;
      case 'destination_pending':
        return SwapStatus.DESTINATION_PENDING;
      case 'destination_confirmed':
        return SwapStatus.DESTINATION_CONFIRMED;
      case 'completed':
        return SwapStatus.COMPLETED;
      case 'failed':
        return SwapStatus.FAILED;
      case 'expired':
        return SwapStatus.EXPIRED;
      case 'cancelled':
        return SwapStatus.CANCELLED;
      case 'refunding':
        return SwapStatus.REFUNDING;
      case 'refunded':
        return SwapStatus.REFUNDED;
      default:
        return SwapStatus.PENDING;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.wsConnection) {
      this.wsConnection.close();
    }
    this.eventListeners.clear();
  }
}

export const relayerService = new RelayerService();