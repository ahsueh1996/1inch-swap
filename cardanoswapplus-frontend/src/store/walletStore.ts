import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ethers } from 'ethers';
import { BigNumber } from 'bignumber.js';

import {
  EthereumWallet,
  CardanoWallet,
  Token,
  Chain,
} from '@/types/swap';
import { cardanoService } from '@/services/cardanoService';
import { isCardanoChain, isEVMChain } from '@/config/chains';

interface WalletState {
  // Ethereum wallet
  ethereumWallet: EthereumWallet | null;
  ethereumProvider: ethers.BrowserProvider | null;
  ethereumSigner: ethers.Signer | null;

  // Cardano wallet
  cardanoWallet: CardanoWallet | null;

  // Connection state
  isConnecting: boolean;
  connectionError: string | null;

  // Balances
  tokenBalances: Record<string, BigNumber>; // token address -> balance

  // Auto-connection
  autoConnectAttempted: boolean;
}

interface WalletActions {
  // Ethereum wallet actions
  connectEthereumWallet: (preferredWallet?: string) => Promise<void>;
  disconnectEthereumWallet: () => void;
  switchEthereumChain: (chainId: number) => Promise<void>;
  addEthereumToken: (token: Token) => Promise<void>;

  // Cardano wallet actions
  connectCardanoWallet: (walletName?: string) => Promise<void>;
  disconnectCardanoWallet: () => void;
  switchCardanoNetwork: (network: 'mainnet' | 'testnet') => Promise<void>;

  // Generic wallet actions
  disconnectWallet: (type: 'ethereum' | 'cardano') => void;
  getWalletForChain: (chain: Chain) => EthereumWallet | CardanoWallet | null;
  isWalletConnectedForChain: (chain: Chain) => boolean;

  // Balance management
  refreshTokenBalance: (token: Token) => Promise<void>;
  refreshAllBalances: () => Promise<void>;

  // Auto-connect
  attemptAutoConnect: () => Promise<void>;

  // Error handling
  setConnectionError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

type WalletStore = WalletState & WalletActions;

const initialState: WalletState = {
  ethereumWallet: null,
  ethereumProvider: null,
  ethereumSigner: null,
  cardanoWallet: null,
  isConnecting: false,
  connectionError: null,
  tokenBalances: {},
  autoConnectAttempted: false,
};

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Connect Ethereum wallet
      connectEthereumWallet: async (preferredWallet) => {
        set({ isConnecting: true, connectionError: null });

        try {
          // Check if MetaMask or other injected wallet is available
          if (typeof window === 'undefined' || !(window as any).ethereum) {
            throw new Error('No Ethereum wallet found. Please install MetaMask or another wallet.');
          }

          const ethereum = (window as any).ethereum;

          // Request account access
          await ethereum.request({ method: 'eth_requestAccounts' });

          // Create provider and signer
          const provider = new ethers.BrowserProvider(ethereum);
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          const network = await provider.getNetwork();

          const ethereumWallet: EthereumWallet = {
            address,
            chainId: Number(network.chainId),
            isConnected: true,
            provider: provider,
            type: 'ethereum',
          };

          set({
            ethereumWallet,
            ethereumProvider: provider,
            ethereumSigner: signer,
          });

          // Set up event listeners
          ethereum.on('accountsChanged', (accounts: string[]) => {
            if (accounts.length === 0) {
              get().disconnectEthereumWallet();
            } else {
              // Account changed, reconnect
              get().connectEthereumWallet();
            }
          });

          ethereum.on('chainChanged', (chainId: string) => {
            const newChainId = parseInt(chainId, 16);
            set((state) => ({
              ethereumWallet: state.ethereumWallet
                ? { ...state.ethereumWallet, chainId: newChainId }
                : null,
            }));
          });

          // Refresh balances
          get().refreshAllBalances();

        } catch (error) {
          console.error('Failed to connect Ethereum wallet:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
          set({ connectionError: errorMessage });
          throw new Error(errorMessage);
        } finally {
          set({ isConnecting: false });
        }
      },

      // Disconnect Ethereum wallet
      disconnectEthereumWallet: () => {
        set({
          ethereumWallet: null,
          ethereumProvider: null,
          ethereumSigner: null,
        });
      },

      // Switch Ethereum chain
      switchEthereumChain: async (chainId) => {
        const { ethereumProvider } = get();

        if (!ethereumProvider) {
          throw new Error('Ethereum wallet not connected');
        }

        try {
          const ethereum = (window as any).ethereum;

          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          });

          // Update wallet state
          set((state) => ({
            ethereumWallet: state.ethereumWallet
              ? { ...state.ethereumWallet, chainId }
              : null,
          }));

        } catch (error: any) {
          // Chain not added, try to add it
          if (error.code === 4902) {
            // This would require chain configuration data
            throw new Error('Chain not added to wallet. Please add it manually.');
          }
          throw error;
        }
      },

      // Add Ethereum token
      addEthereumToken: async (token) => {
        const ethereum = (window as any).ethereum;

        if (!ethereum) {
          throw new Error('Ethereum wallet not connected');
        }

        try {
          await ethereum.request({
            method: 'wallet_watchAsset',
            params: {
              type: 'ERC20',
              options: {
                address: token.address,
                symbol: token.symbol,
                decimals: token.decimals,
                image: token.logoURI,
              },
            },
          });
        } catch (error) {
          console.error('Failed to add token to wallet:', error);
          throw new Error('Failed to add token to wallet');
        }
      },

      // Connect Cardano wallet
      connectCardanoWallet: async (walletName) => {
        set({ isConnecting: true, connectionError: null });

        try {
          // Get available wallets
          const availableWallets = cardanoService.getAvailableWallets();

          if (availableWallets.length === 0) {
            throw new Error('No Cardano wallet found. Please install Nami, Eternl, or another Cardano wallet.');
          }

          // Use specified wallet or first available
          const targetWallet = walletName || availableWallets[0];

          if (!availableWallets.includes(targetWallet)) {
            throw new Error(`${targetWallet} wallet not found`);
          }

          // Connect to wallet
          const cardanoWallet = await cardanoService.connectWallet(targetWallet);

          set({ cardanoWallet });

          // Refresh balances
          get().refreshAllBalances();

        } catch (error) {
          console.error('Failed to connect Cardano wallet:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to connect Cardano wallet';
          set({ connectionError: errorMessage });
          throw new Error(errorMessage);
        } finally {
          set({ isConnecting: false });
        }
      },

      // Disconnect Cardano wallet
      disconnectCardanoWallet: () => {
        set({ cardanoWallet: null });
      },

      // Switch Cardano network
      switchCardanoNetwork: async (network) => {
        await cardanoService.switchNetwork(network);

        // Reconnect wallet with new network
        const { cardanoWallet } = get();
        if (cardanoWallet) {
          // Get wallet name from stored connection
          const walletName = 'nami'; // This would be stored in the wallet state
          await get().connectCardanoWallet(walletName);
        }
      },

      // Generic disconnect
      disconnectWallet: (type) => {
        if (type === 'ethereum') {
          get().disconnectEthereumWallet();
        } else {
          get().disconnectCardanoWallet();
        }
      },

      // Get wallet for chain
      getWalletForChain: (chain) => {
        const { ethereumWallet, cardanoWallet } = get();

        if (isCardanoChain(chain.id)) {
          return cardanoWallet;
        } else if (isEVMChain(chain.id)) {
          return ethereumWallet;
        }

        return null;
      },

      // Check if wallet is connected for chain
      isWalletConnectedForChain: (chain) => {
        const wallet = get().getWalletForChain(chain);
        return wallet?.isConnected || false;
      },

      // Refresh token balance
      refreshTokenBalance: async (token) => {
        try {
          const wallet = get().getWalletForChain({ id: token.chainId } as Chain);

          if (!wallet || !wallet.isConnected) {
            return;
          }

          let balance: BigNumber;

          if (isCardanoChain(token.chainId)) {
            balance = await cardanoService.getTokenBalance(token);
          } else {
            // For Ethereum tokens
            const { ethereumProvider } = get();
            if (!ethereumProvider) return;

            if (token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' || token.address === '') {
              // Native token (ETH)
              const balance = await ethereumProvider.getBalance(wallet.address);
              const balanceBN = new BigNumber(balance.toString()).dividedBy(new BigNumber(10).pow(token.decimals));

              set((state) => ({
                tokenBalances: {
                  ...state.tokenBalances,
                  [`${token.chainId}-${token.address}`]: balanceBN,
                },
              }));
            } else {
              // ERC20 token
              const contract = new ethers.Contract(
                token.address,
                ['function balanceOf(address owner) view returns (uint256)'],
                ethereumProvider
              );

              const balance = await contract.balanceOf(wallet.address);
              const balanceBN = new BigNumber(balance.toString()).dividedBy(new BigNumber(10).pow(token.decimals));

              set((state) => ({
                tokenBalances: {
                  ...state.tokenBalances,
                  [`${token.chainId}-${token.address}`]: balanceBN,
                },
              }));
            }
          }

        } catch (error) {
          console.error('Failed to refresh token balance:', error);
        }
      },

      // Refresh all balances
      refreshAllBalances: async () => {
        const { ethereumWallet, cardanoWallet } = get();

        // This would typically refresh balances for all known tokens
        // For now, we'll just refresh native tokens

        if (ethereumWallet) {
          // Refresh ETH balance
          const ethToken: Token = {
            address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            symbol: 'ETH',
            name: 'Ether',
            decimals: 18,
            chainId: ethereumWallet.chainId,
          };

          await get().refreshTokenBalance(ethToken);
        }

        if (cardanoWallet) {
          // Refresh ADA balance
          const adaToken: Token = {
            address: '',
            symbol: 'ADA',
            name: 'Cardano',
            decimals: 6,
            chainId: cardanoWallet.chainId,
          };

          await get().refreshTokenBalance(adaToken);
        }
      },

      // Auto-connect
      attemptAutoConnect: async () => {
        const { autoConnectAttempted } = get();

        if (autoConnectAttempted) return;

        set({ autoConnectAttempted: true });

        try {
          // Try to auto-connect Ethereum wallet
          if (typeof window !== 'undefined' && (window as any).ethereum) {
            const ethereum = (window as any).ethereum;
            const accounts = await ethereum.request({ method: 'eth_accounts' });

            if (accounts.length > 0) {
              await get().connectEthereumWallet();
            }
          }

          // Try to auto-connect Cardano wallet
          const availableWallets = cardanoService.getAvailableWallets();
          if (availableWallets.length > 0) {
            // Check if any wallet was previously connected
            // This would typically check localStorage or session storage
            const lastConnectedWallet = localStorage.getItem('lastConnectedCardanoWallet');
            if (lastConnectedWallet && availableWallets.includes(lastConnectedWallet)) {
              try {
                await get().connectCardanoWallet(lastConnectedWallet);
              } catch (error) {
                // Ignore auto-connect failures
                console.log('Auto-connect to Cardano wallet failed:', error);
              }
            }
          }

        } catch (error) {
          // Ignore auto-connect failures
          console.log('Auto-connect failed:', error);
        }
      },

      // Set connection error
      setConnectionError: (error) => set({ connectionError: error }),

      // Reset store
      reset: () => set(initialState),
    }),
    {
      name: 'wallet-store',
      partialize: (state) => ({
        // Only persist wallet connection preferences, not actual wallet instances
        autoConnectAttempted: state.autoConnectAttempted,
      }),
    }
  )
);