'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FiInfo, FiArrowRight, FiShield, FiClock } from 'react-icons/fi';
import { BigNumber } from 'bignumber.js';

import { SwapQuote } from '@/types/swap';

interface TransactionDetailsProps {
  quote: SwapQuote;
  className?: string;
}

const TransactionDetails: React.FC<TransactionDetailsProps> = ({
  quote,
  className = '',
}) => {
  const formatNumber = (value: BigNumber, decimals: number = 4): string => {
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

  const getMinimumReceived = (): BigNumber => {
    return quote.toAmount.multipliedBy(1 - quote.slippage / 10000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${className}`}
    >
      <div className="flex items-center space-x-2 mb-4">
        <FiInfo className="w-4 h-4 text-primary-500" />
        <h3 className="font-medium text-gray-900 dark:text-white">
          Transaction Details
        </h3>
      </div>

      <div className="space-y-4">
        {/* Swap Overview */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">You Pay</div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {formatNumber(quote.fromAmount)} {quote.fromToken.symbol}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                on {quote.fromChain.name}
              </div>
            </div>

            <FiArrowRight className="w-5 h-5 text-gray-400" />

            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">You Receive</div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {formatNumber(quote.toAmount)} {quote.toToken.symbol}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                on {quote.toChain.name}
              </div>
            </div>
          </div>
        </div>

        {/* Key Details */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Exchange Rate</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              1 {quote.fromToken.symbol} = {formatNumber(quote.exchangeRate)} {quote.toToken.symbol}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Minimum Received</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {formatNumber(getMinimumReceived())} {quote.toToken.symbol}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Price Impact</span>
            <span className={`text-sm font-medium ${
              quote.priceImpact.lt(1) ? 'text-green-600 dark:text-green-400' :
              quote.priceImpact.lt(3) ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {formatNumber(quote.priceImpact, 2)}%
            </span>
          </div>

          <div className="flex justify-between">
            <div className="flex items-center space-x-1">
              <FiClock className="w-3 h-3 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Estimated Time</span>
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {formatTime(quote.estimatedTime)}
            </span>
          </div>
        </div>

        {/* Cross-Chain Notice */}
        {quote.fromChain.id !== quote.toChain.id && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <FiShield className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Cross-Chain Atomic Swap
                </div>
                <div className="text-blue-700 dark:text-blue-300">
                  This transaction uses Hash Time-Locked Contracts (HTLC) to ensure atomic execution
                  across {quote.fromChain.name} and {quote.toChain.name}. Your funds are protected
                  by cryptographic guarantees.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fee Breakdown */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Fee Breakdown
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Network Fees</span>
              <span className="text-gray-900 dark:text-white">
                ${formatNumber(quote.fees.networkFee, 6)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Protocol Fee</span>
              <span className="text-gray-900 dark:text-white">
                ${formatNumber(quote.fees.protocolFee, 6)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Resolver Fee</span>
              <span className="text-gray-900 dark:text-white">
                ${formatNumber(quote.fees.resolverFee, 6)}
              </span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-600 pt-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-gray-900 dark:text-white">Total Fees</span>
                <span className="text-gray-900 dark:text-white">
                  ${formatNumber(
                    quote.fees.networkFee.plus(quote.fees.protocolFee).plus(quote.fees.resolverFee),
                    6
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Route Information */}
        {quote.route && quote.route.length > 1 && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              Swap Route
            </h4>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
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
          </div>
        )}

        {/* Security Notice */}
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <FiShield className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <div className="font-medium text-green-900 dark:text-green-100 mb-1">
                Secure & Trustless
              </div>
              <div className="text-green-700 dark:text-green-300">
                Your transaction is secured by smart contracts and atomic swap technology.
                No centralized intermediaries can access your funds.
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TransactionDetails;