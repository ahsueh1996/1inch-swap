'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronDown, FiInfo, FiClock, FiShield } from 'react-icons/fi';
import { BigNumber } from 'bignumber.js';

import { SwapQuote } from '@/types/swap';

interface SwapQuoteDisplayProps {
  quote: SwapQuote;
  isLoading?: boolean;
  className?: string;
}

const SwapQuoteDisplay: React.FC<SwapQuoteDisplayProps> = ({
  quote,
  isLoading = false,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const formatNumber = (value: BigNumber, decimals: number = 4): string => {
    if (value.isZero()) return '0';
    return value.toFixed(decimals);
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `~${hours}h ${minutes % 60}m`;
    }
    return `~${minutes}m`;
  };

  const getPriceImpactColor = (impact: BigNumber): string => {
    const impactPercent = impact.toNumber();
    if (impactPercent < 1) return 'text-green-600 dark:text-green-400';
    if (impactPercent < 3) return 'text-yellow-600 dark:text-yellow-400';
    if (impactPercent < 5) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  if (isLoading) {
    return (
      <div className={`bg-gray-50 dark:bg-gray-900 rounded-xl p-4 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  const totalFees = quote.fees.networkFee.plus(quote.fees.protocolFee).plus(quote.fees.resolverFee);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gray-50 dark:bg-gray-900 rounded-xl p-4 ${className}`}
    >
      {/* Quote Summary */}
      <div className="space-y-3">
        {/* Exchange Rate */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Exchange Rate</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            1 {quote.fromToken.symbol} = {formatNumber(quote.exchangeRate)} {quote.toToken.symbol}
          </span>
        </div>

        {/* Price Impact */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <span className="text-sm text-gray-600 dark:text-gray-400">Price Impact</span>
            <FiInfo className="w-3 h-3 text-gray-400" />
          </div>
          <span className={`text-sm font-medium ${getPriceImpactColor(quote.priceImpact)}`}>
            {formatNumber(quote.priceImpact, 2)}%
          </span>
        </div>

        {/* Estimated Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <FiClock className="w-3 h-3 text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Est. Time</span>
          </div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {formatTime(quote.estimatedTime)}
          </span>
        </div>

        {/* Total Fees */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Total Fees</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            ${formatNumber(totalFees, 4)}
          </span>
        </div>
      </div>

      {/* Details Toggle */}
      <motion.button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-center space-x-2 mt-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <span>View Details</span>
        <motion.div
          animate={{ rotate: showDetails ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <FiChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.button>

      {/* Detailed Information */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3"
          >
            {/* Fee Breakdown */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                Fee Breakdown
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Network Fee</span>
                  <span className="text-gray-900 dark:text-white">
                    ${formatNumber(quote.fees.networkFee, 4)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Protocol Fee</span>
                  <span className="text-gray-900 dark:text-white">
                    ${formatNumber(quote.fees.protocolFee, 4)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Resolver Fee</span>
                  <span className="text-gray-900 dark:text-white">
                    ${formatNumber(quote.fees.resolverFee, 4)}
                  </span>
                </div>
              </div>
            </div>

            {/* Route Information */}
            {quote.route && quote.route.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Swap Route
                </h4>
                <div className="space-y-1">
                  {quote.route.map((step, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        {step.protocol}
                      </span>
                      <span className="text-gray-900 dark:text-white">
                        {step.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cross-Chain Info */}
            {quote.fromChain.id !== quote.toChain.id && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <FiShield className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                      Cross-Chain Swap
                    </div>
                    <div className="text-blue-700 dark:text-blue-300">
                      This swap uses atomic swap technology with Hash Time-Locked Contracts (HTLC)
                      to ensure your funds are secure during the cross-chain transfer.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Slippage Info */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <FiInfo className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <div className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                    Slippage Tolerance: {(quote.slippage / 100).toFixed(2)}%
                  </div>
                  <div className="text-yellow-700 dark:text-yellow-300">
                    The minimum amount you'll receive is{' '}
                    {formatNumber(quote.toAmount.multipliedBy(1 - quote.slippage / 10000))} {quote.toToken.symbol}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SwapQuoteDisplay;