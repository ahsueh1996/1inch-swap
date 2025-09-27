import { create } from 'zustand';
import { BigNumber } from 'bignumber.js';
import { persist } from 'zustand/middleware';

import {
  Token,
  Chain,
  SwapQuote,
  SwapParams,
  SwapOrder,
  SwapStatus,
  SwapSettings,
  SwapProgress,
} from '@/types/swap';
import { getDefaultChainPair, isCardanoChain, isEVMChain } from '@/config/chains';
import { oneInchService } from '@/services/oneinchService';
import { relayerService } from '@/services/relayerService';
import { cardanoService } from '@/services/cardanoService';

export type SwapDirection = 'eth-to-cardano' | 'cardano-to-eth' | 'eth-to-eth' | 'cardano-to-cardano';

interface SwapState {
  // Swap parameters
  fromToken: Token | null;
  toToken: Token | null;
  fromChain: Chain | null;
  toChain: Chain | null;
  fromAmount: BigNumber;
  toAmount: BigNumber;

  // Swap state
  quote: SwapQuote | null;
  currentOrder: SwapOrder | null;
  isLoading: boolean;
  error: string | null;

  // Settings
  settings: SwapSettings;

  // Progress tracking
  swapProgress: SwapProgress[];

  // Direction
  swapDirection: SwapDirection;

  // Recent swaps
  recentSwaps: SwapOrder[];
}

interface SwapActions {
  // Setters
  setFromToken: (token: Token | null) => void;
  setToToken: (token: Token | null) => void;
  setFromChain: (chain: Chain | null) => void;
  setToChain: (chain: Chain | null) => void;
  setFromAmount: (amount: BigNumber) => void;
  setToAmount: (amount: BigNumber) => void;
  setQuote: (quote: SwapQuote | null) => void;
  setSettings: (settings: Partial<SwapSettings>) => void;
  setError: (error: string | null) => void;

  // Actions
  getQuote: (params: SwapParams) => Promise<void>;
  executeSwap: (quote: SwapQuote) => Promise<SwapOrder>;
  cancelSwap: (orderId: string) => Promise<boolean>;
  refreshSwapStatus: (orderId: string) => Promise<void>;

  // Direction handling
  flipSwapDirection: () => void;
  detectSwapDirection: () => SwapDirection;

  // History
  addRecentSwap: (order: SwapOrder) => void;
  clearRecentSwaps: () => void;

  // Reset
  reset: () => void;
}

type SwapStore = SwapState & SwapActions;

const initialState: SwapState = {
  fromToken: null,
  toToken: null,
  fromChain: null,
  toChain: null,
  fromAmount: new BigNumber(0),
  toAmount: new BigNumber(0),
  quote: null,
  currentOrder: null,
  isLoading: false,
  error: null,
  settings: {
    slippage: 100, // 1% in basis points
    deadline: 30, // 30 minutes
    autoRefresh: true,
    expertMode: false,
  },
  swapProgress: [],
  swapDirection: 'eth-to-cardano',
  recentSwaps: [],
};

export const useSwapStore = create<SwapStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Setters
      setFromToken: (token) => {
        set({ fromToken: token });
        get().detectSwapDirection();
      },

      setToToken: (token) => {
        set({ toToken: token });
        get().detectSwapDirection();
      },

      setFromChain: (chain) => {
        set({ fromChain: chain });
        get().detectSwapDirection();
      },

      setToChain: (chain) => {
        set({ toChain: chain });
        get().detectSwapDirection();
      },

      setFromAmount: (amount) => {
        set({ fromAmount: amount });
        // Auto-refresh quote if auto-refresh is enabled
        const { settings, fromToken, toToken, fromChain, toChain } = get();
        if (settings.autoRefresh && fromToken && toToken && fromChain && toChain && !amount.isZero()) {
          get().getQuote({
            fromToken,
            toToken,
            fromChain,
            toChain,
            amount,
            slippage: settings.slippage,
          });
        }
      },

      setToAmount: (amount) => set({ toAmount: amount }),

      setQuote: (quote) => {
        set({ quote });
        if (quote) {
          set({ toAmount: quote.toAmount });
        }
      },

      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      setError: (error) => set({ error }),

      // Get quote
      getQuote: async (params) => {
        const { fromToken, toToken, fromChain, toChain } = params;

        if (!fromToken || !toToken || !fromChain || !toChain) {
          set({ error: 'Missing required parameters for quote' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          let quote: SwapQuote;

          // Determine which service to use based on swap direction
          const direction = get().detectSwapDirection();

          switch (direction) {
            case 'eth-to-eth':
              // Use 1inch for EVM-to-EVM swaps
              quote = await oneInchService.getQuote(params);
              break;

            case 'eth-to-cardano':
            case 'cardano-to-eth':
            case 'cardano-to-cardano':
              // Use relayer for cross-chain swaps involving Cardano
              quote = await relayerService.getQuote(params);
              break;

            default:
              throw new Error('Unsupported swap direction');
          }

          set({ quote, toAmount: quote.toAmount });
        } catch (error) {
          console.error('Failed to get quote:', error);
          set({ error: error instanceof Error ? error.message : 'Failed to get quote' });
        } finally {
          set({ isLoading: false });
        }
      },

      // Execute swap
      executeSwap: async (quote) => {
        const { fromChain, toChain } = quote;

        set({ isLoading: true, error: null });

        try {
          let order: SwapOrder;
          const direction = get().detectSwapDirection();

          switch (direction) {
            case 'eth-to-eth':
              // For EVM-to-EVM swaps, we need wallet address
              // This would be handled by the wallet store
              throw new Error('EVM-to-EVM swaps not yet implemented in UI');

            case 'eth-to-cardano':
            case 'cardano-to-eth':
            case 'cardano-to-cardano':
              // Use relayer for cross-chain swaps
              order = await relayerService.submitSwapOrder(
                {
                  fromToken: quote.fromToken,
                  toToken: quote.toToken,
                  fromChain: quote.fromChain,
                  toChain: quote.toChain,
                  amount: quote.fromAmount,
                  slippage: quote.slippage,
                },
                '', // fromAddress - would get from wallet store
                ''  // toAddress - would get from wallet store
              );
              break;

            default:
              throw new Error('Unsupported swap direction');
          }

          set({ currentOrder: order });
          get().addRecentSwap(order);

          // Start monitoring progress
          get().startProgressMonitoring(order.id);

          return order;
        } catch (error) {
          console.error('Failed to execute swap:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to execute swap';
          set({ error: errorMessage });
          throw new Error(errorMessage);
        } finally {
          set({ isLoading: false });
        }
      },

      // Cancel swap
      cancelSwap: async (orderId) => {
        try {
          const success = await relayerService.cancelSwap(orderId, 'User cancelled');

          if (success) {
            set((state) => ({
              currentOrder: state.currentOrder?.id === orderId
                ? { ...state.currentOrder, status: SwapStatus.CANCELLED }
                : state.currentOrder,
              recentSwaps: state.recentSwaps.map(swap =>
                swap.id === orderId
                  ? { ...swap, status: SwapStatus.CANCELLED }
                  : swap
              ),
            }));
          }

          return success;
        } catch (error) {
          console.error('Failed to cancel swap:', error);
          return false;
        }
      },

      // Refresh swap status
      refreshSwapStatus: async (orderId) => {
        try {
          const status = await relayerService.getSwapStatus(orderId);
          const swapStatus = relayerService['mapRelayerStatus'](status.status);

          set((state) => ({
            currentOrder: state.currentOrder?.id === orderId
              ? { ...state.currentOrder, status: swapStatus }
              : state.currentOrder,
            recentSwaps: state.recentSwaps.map(swap =>
              swap.id === orderId
                ? { ...swap, status: swapStatus }
                : swap
            ),
          }));
        } catch (error) {
          console.error('Failed to refresh swap status:', error);
        }
      },

      // Flip swap direction
      flipSwapDirection: () => {
        const { fromToken, toToken, fromChain, toChain, fromAmount, toAmount } = get();

        set({
          fromToken: toToken,
          toToken: fromToken,
          fromChain: toChain,
          toChain: fromChain,
          fromAmount: toAmount,
          toAmount: fromAmount,
          quote: null, // Clear quote when flipping
        });

        get().detectSwapDirection();
      },

      // Detect swap direction
      detectSwapDirection: () => {
        const { fromChain, toChain } = get();

        if (!fromChain || !toChain) {
          return 'eth-to-cardano';
        }

        const fromIsCardano = isCardanoChain(fromChain.id);
        const toIsCardano = isCardanoChain(toChain.id);
        const fromIsEVM = isEVMChain(fromChain.id);
        const toIsEVM = isEVMChain(toChain.id);

        let direction: SwapDirection;

        if (fromIsEVM && toIsEVM) {
          direction = 'eth-to-eth';
        } else if (fromIsEVM && toIsCardano) {
          direction = 'eth-to-cardano';
        } else if (fromIsCardano && toIsEVM) {
          direction = 'cardano-to-eth';
        } else if (fromIsCardano && toIsCardano) {
          direction = 'cardano-to-cardano';
        } else {
          direction = 'eth-to-cardano'; // Default
        }

        set({ swapDirection: direction });
        return direction;
      },

      // Add recent swap
      addRecentSwap: (order) => {
        set((state) => ({
          recentSwaps: [order, ...state.recentSwaps.slice(0, 9)], // Keep last 10
        }));
      },

      // Clear recent swaps
      clearRecentSwaps: () => set({ recentSwaps: [] }),

      // Start progress monitoring
      startProgressMonitoring: async (orderId: string) => {
        const updateProgress = async () => {
          try {
            const progress = await relayerService.getSwapProgress(orderId);
            set({ swapProgress: progress });

            // Continue monitoring if swap is not complete
            const status = await relayerService.getSwapStatus(orderId);
            if (!['completed', 'failed', 'cancelled', 'expired'].includes(status.status)) {
              setTimeout(updateProgress, 5000); // Check every 5 seconds
            }
          } catch (error) {
            console.error('Failed to update progress:', error);
          }
        };

        updateProgress();
      },

      // Reset store
      reset: () => set(initialState),
    }),
    {
      name: 'swap-store',
      partialize: (state) => ({
        settings: state.settings,
        recentSwaps: state.recentSwaps,
      }),
    }
  )
);