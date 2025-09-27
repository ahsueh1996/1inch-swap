'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowUpDown, FiSettings, FiRefreshCw, FiInfo } from 'react-icons/fi';
import { BigNumber } from 'bignumber.js';
import toast from 'react-hot-toast';

import { Token, Chain, SwapQuote, SwapParams, SwapStatus } from '@/types/swap';
import { getDefaultChainPair, isCardanoChain, isEVMChain } from '@/config/chains';
import { getTokensByChain, getNativeToken } from '@/config/tokens';
import { useSwapStore } from '@/store/swapStore';
import { useWalletStore } from '@/store/walletStore';

import TokenSelector from './TokenSelector';
import ChainSelector from './ChainSelector';
import WalletConnector from './WalletConnector';
import SwapSettings from './SwapSettings';
import SwapQuoteDisplay from './SwapQuoteDisplay';
import SwapProgressModal from './SwapProgressModal';
import TransactionDetails from './TransactionDetails';

const SwapInterface: React.FC = () => {
  // Store state
  const {
    fromToken,
    toToken,
    fromChain,
    toChain,
    fromAmount,
    toAmount,
    quote,
    settings,
    isLoading,
    setFromToken,
    setToToken,
    setFromChain,
    setToChain,
    setFromAmount,
    setToAmount,
    setQuote,
    getQuote,
    executeSwap,
    swapDirection,
    flipSwapDirection,
  } = useSwapStore();

  const {
    ethereumWallet,
    cardanoWallet,
    connectEthereumWallet,
    connectCardanoWallet,
    disconnectWallet,
  } = useWalletStore();

  // Local state
  const [showSettings, setShowSettings] = useState(false);
  const [showSwapProgress, setShowSwapProgress] = useState(false);
  const [fromAmountInput, setFromAmountInput] = useState('');
  const [toAmountInput, setToAmountInput] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize with default values
  useEffect(() => {
    const { source, destination } = getDefaultChainPair();
    if (!fromChain || !toChain) {
      setFromChain(source);
      setToChain(destination);
    }
    if (!fromToken) {
      const sourceTokens = getTokensByChain(source.id);
      setFromToken(getNativeToken(source.id) || sourceTokens[0]);
    }
    if (!toToken) {
      const destTokens = getTokensByChain(destination.id);
      setToToken(getNativeToken(destination.id) || destTokens[0]);
    }
  }, [fromChain, toChain, fromToken, toToken, setFromChain, setToChain, setFromToken, setToToken]);

  // Handle amount input changes
  const handleFromAmountChange = useCallback((value: string) => {
    setFromAmountInput(value);
    if (value && !isNaN(Number(value))) {
      setFromAmount(new BigNumber(value));
    } else {
      setFromAmount(new BigNumber(0));
    }
  }, [setFromAmount]);

  const handleToAmountChange = useCallback((value: string) => {
    setToAmountInput(value);
    if (value && !isNaN(Number(value))) {
      setToAmount(new BigNumber(value));
    } else {
      setToAmount(new BigNumber(0));
    }
  }, [setToAmount]);

  // Update input fields when amounts change
  useEffect(() => {
    if (fromAmount && !fromAmount.isZero()) {
      setFromAmountInput(fromAmount.toString());
    }
  }, [fromAmount]);

  useEffect(() => {
    if (toAmount && !toAmount.isZero()) {
      setToAmountInput(toAmount.toString());
    }
  }, [toAmount]);

  // Flip token and chain positions
  const handleFlipSwap = useCallback(() => {
    flipSwapDirection();

    // Swap input values
    const tempFromInput = fromAmountInput;
    setFromAmountInput(toAmountInput);
    setToAmountInput(tempFromInput);
  }, [flipSwapDirection, fromAmountInput, toAmountInput]);

  // Get quote when parameters change
  const refreshQuote = useCallback(async () => {
    if (!fromToken || !toToken || !fromChain || !toChain || !fromAmount || fromAmount.isZero()) {
      return;
    }

    setIsRefreshing(true);
    try {
      const swapParams: SwapParams = {
        fromToken,
        toToken,
        fromChain,
        toChain,
        amount: fromAmount,
        slippage: settings.slippage,
        deadline: Date.now() + (settings.deadline * 60 * 1000),
      };

      await getQuote(swapParams);
    } catch (error) {
      console.error('Failed to get quote:', error);
      toast.error('Failed to get swap quote');
    } finally {
      setIsRefreshing(false);
    }
  }, [fromToken, toToken, fromChain, toChain, fromAmount, settings, getQuote]);

  // Auto-refresh quote
  useEffect(() => {
    if (settings.autoRefresh) {
      refreshQuote();
      const interval = setInterval(refreshQuote, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [refreshQuote, settings.autoRefresh]);

  // Check wallet connectivity
  const getRequiredWallet = (chain: Chain) => {
    return isCardanoChain(chain.id) ? cardanoWallet : ethereumWallet;
  };

  const isWalletConnected = (chain: Chain) => {
    const wallet = getRequiredWallet(chain);
    return wallet?.isConnected || false;
  };

  const connectRequiredWallet = async (chain: Chain) => {
    try {
      if (isCardanoChain(chain.id)) {
        await connectCardanoWallet();
      } else {
        await connectEthereumWallet();
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      toast.error('Failed to connect wallet');
    }
  };

  // Execute swap
  const handleSwap = async () => {
    if (!quote || !fromToken || !toToken || !fromChain || !toChain) {
      toast.error('Invalid swap parameters');
      return;
    }

    // Check wallet connections
    if (!isWalletConnected(fromChain)) {
      toast.error(`Please connect your ${isCardanoChain(fromChain.id) ? 'Cardano' : 'Ethereum'} wallet`);
      return;
    }

    if (!isWalletConnected(toChain)) {
      toast.error(`Please connect your ${isCardanoChain(toChain.id) ? 'Cardano' : 'Ethereum'} wallet`);
      return;
    }

    setShowSwapProgress(true);
    try {
      await executeSwap(quote);
      toast.success('Swap completed successfully!');
    } catch (error) {
      console.error('Swap failed:', error);
      toast.error('Swap failed. Please try again.');
    } finally {
      setShowSwapProgress(false);
    }
  };

  // Check if swap is possible
  const canSwap = fromToken && toToken && fromChain && toChain &&
                  fromAmount && !fromAmount.isZero() &&
                  isWalletConnected(fromChain) && isWalletConnected(toChain) &&
                  quote && !isLoading;

  return (
    <div className="max-w-md mx-auto">
      {/* Main Swap Interface */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Cross-Chain Swap
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                       hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <FiSettings className="w-5 h-5" />
            </button>
            <button
              onClick={refreshQuote}
              disabled={isRefreshing || isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                       hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <FiRefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* From Section */}
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">From</span>
              <ChainSelector
                selectedChain={fromChain}
                onSelect={setFromChain}
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center space-x-3">
              <TokenSelector
                selectedToken={fromToken}
                chain={fromChain}
                onSelect={setFromToken}
                disabled={isLoading}
              />
              <input
                type="text"
                value={fromAmountInput}
                onChange={(e) => handleFromAmountChange(e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-right text-xl font-semibold text-gray-900 dark:text-white
                         placeholder-gray-400 border-none outline-none"
                disabled={isLoading}
              />
            </div>

            {/* Balance */}
            {fromToken && (
              <div className="flex justify-between mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span>Balance: {fromToken.balance?.toString() || '0'}</span>
                <button
                  onClick={() => handleFromAmountChange(fromToken.balance?.toString() || '0')}
                  className="text-primary-500 hover:text-primary-600 font-medium"
                  disabled={isLoading}
                >
                  Max
                </button>
              </div>
            )}
          </div>

          {/* Flip Button */}
          <div className="flex justify-center">
            <motion.button
              onClick={handleFlipSwap}
              disabled={isLoading}
              className="p-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600
                       rounded-full shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <FiArrowUpDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </motion.button>
          </div>

          {/* To Section */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">To</span>
              <ChainSelector
                selectedChain={toChain}
                onSelect={setToChain}
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center space-x-3">
              <TokenSelector
                selectedToken={toToken}
                chain={toChain}
                onSelect={setToToken}
                disabled={isLoading}
              />
              <input
                type="text"
                value={toAmountInput}
                onChange={(e) => handleToAmountChange(e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-right text-xl font-semibold text-gray-900 dark:text-white
                         placeholder-gray-400 border-none outline-none"
                disabled={isLoading}
                readOnly
              />
            </div>

            {/* Balance */}
            {toToken && (
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Balance: {toToken.balance?.toString() || '0'}
              </div>
            )}
          </div>

          {/* Quote Display */}
          {quote && (
            <SwapQuoteDisplay quote={quote} isLoading={isLoading} />
          )}

          {/* Wallet Connections */}
          <div className="space-y-2">
            {fromChain && !isWalletConnected(fromChain) && (
              <WalletConnector
                chain={fromChain}
                onConnect={() => connectRequiredWallet(fromChain)}
              />
            )}
            {toChain && !isWalletConnected(toChain) && fromChain.id !== toChain.id && (
              <WalletConnector
                chain={toChain}
                onConnect={() => connectRequiredWallet(toChain)}
              />
            )}
          </div>

          {/* Swap Button */}
          <motion.button
            onClick={handleSwap}
            disabled={!canSwap}
            className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600
                     hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-xl
                     disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            whileHover={{ scale: canSwap ? 1.02 : 1 }}
            whileTap={{ scale: canSwap ? 0.98 : 1 }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Getting Quote...</span>
              </div>
            ) : !isWalletConnected(fromChain) || !isWalletConnected(toChain) ? (
              'Connect Wallets'
            ) : !fromAmount || fromAmount.isZero() ? (
              'Enter Amount'
            ) : !quote ? (
              'Get Quote'
            ) : (
              'Swap'
            )}
          </motion.button>
        </div>
      </div>

      {/* Transaction Details */}
      {quote && (
        <div className="mt-4">
          <TransactionDetails quote={quote} />
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showSettings && (
          <SwapSettings
            onClose={() => setShowSettings(false)}
          />
        )}
        {showSwapProgress && (
          <SwapProgressModal
            onClose={() => setShowSwapProgress(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SwapInterface;