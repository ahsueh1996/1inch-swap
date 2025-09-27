'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronDown, FiSearch, FiX } from 'react-icons/fi';
import Image from 'next/image';

import { Token, Chain } from '@/types/swap';
import { getTokensByChain } from '@/config/tokens';
import { useWalletStore } from '@/store/walletStore';

interface TokenSelectorProps {
  selectedToken: Token | null;
  chain: Chain | null;
  onSelect: (token: Token) => void;
  disabled?: boolean;
  className?: string;
}

const TokenSelector: React.FC<TokenSelectorProps> = ({
  selectedToken,
  chain,
  onSelect,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { tokenBalances, refreshTokenBalance } = useWalletStore();

  // Get available tokens for the selected chain
  const availableTokens = useMemo(() => {
    if (!chain) return [];
    return getTokensByChain(chain.id);
  }, [chain]);

  // Filter tokens based on search query
  const filteredTokens = useMemo(() => {
    if (!searchQuery) return availableTokens;

    const query = searchQuery.toLowerCase();
    return availableTokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query)
    );
  }, [availableTokens, searchQuery]);

  const handleTokenSelect = (token: Token) => {
    onSelect(token);
    setIsOpen(false);
    setSearchQuery('');

    // Refresh balance for selected token
    refreshTokenBalance(token);
  };

  const getTokenBalance = (token: Token) => {
    const balanceKey = `${token.chainId}-${token.address}`;
    return tokenBalances[balanceKey];
  };

  const TokenRow: React.FC<{ token: Token; isSelected: boolean }> = ({ token, isSelected }) => {
    const balance = getTokenBalance(token);

    return (
      <motion.button
        onClick={() => handleTokenSelect(token)}
        className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
          isSelected
            ? 'bg-primary-50 border border-primary-200'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center space-x-3">
          {/* Token Icon */}
          <div className="relative w-8 h-8">
            {token.logoURI ? (
              <Image
                src={token.logoURI}
                alt={token.symbol}
                fill
                className="rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-semibold">
                  {token.symbol.slice(0, 2)}
                </span>
              </div>
            )}
          </div>

          {/* Token Info */}
          <div className="text-left">
            <div className="font-semibold text-gray-900 dark:text-white">
              {token.symbol}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {token.name}
            </div>
          </div>
        </div>

        {/* Balance */}
        {balance && (
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {balance.toFixed(4)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              ${(balance.multipliedBy(100)).toFixed(2)} {/* Mock USD value */}
            </div>
          </div>
        )}
      </motion.button>
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <motion.button
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className={`flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600
                   rounded-lg hover:border-gray-300 dark:hover:border-gray-500 transition-colors ${
                     disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                   }`}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        {selectedToken ? (
          <>
            {/* Selected Token */}
            <div className="flex items-center space-x-2">
              <div className="relative w-6 h-6">
                {selectedToken.logoURI ? (
                  <Image
                    src={selectedToken.logoURI}
                    alt={selectedToken.symbol}
                    fill
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-semibold">
                      {selectedToken.symbol.slice(0, 1)}
                    </span>
                  </div>
                )}
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">
                {selectedToken.symbol}
              </span>
            </div>
          </>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">Select Token</span>
        )}

        {!disabled && (
          <FiChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </motion.button>

      {/* Token Selection Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Select Token
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* Search */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-600">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search tokens..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                </div>
              </div>

              {/* Token List */}
              <div className="max-h-96 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {filteredTokens.length > 0 ? (
                    filteredTokens.map((token) => (
                      <TokenRow
                        key={`${token.chainId}-${token.address}`}
                        token={token}
                        isSelected={
                          selectedToken?.address === token.address &&
                          selectedToken?.chainId === token.chainId
                        }
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {searchQuery ? 'No tokens found' : 'No tokens available'}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-600">
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Don't see your token?{' '}
                  <button className="text-primary-500 hover:text-primary-600 font-medium">
                    Import custom token
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TokenSelector;