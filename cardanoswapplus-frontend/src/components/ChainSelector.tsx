'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronDown, FiX } from 'react-icons/fi';
import Image from 'next/image';

import { Chain } from '@/types/swap';
import { ALL_SUPPORTED_CHAINS, isCardanoChain, isEVMChain } from '@/config/chains';

interface ChainSelectorProps {
  selectedChain: Chain | null;
  onSelect: (chain: Chain) => void;
  disabled?: boolean;
  className?: string;
  excludeChains?: number[];
}

const ChainSelector: React.FC<ChainSelectorProps> = ({
  selectedChain,
  onSelect,
  disabled = false,
  className = '',
  excludeChains = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Filter available chains
  const availableChains = ALL_SUPPORTED_CHAINS.filter(
    (chain) => !excludeChains.includes(chain.id)
  );

  // Group chains by type
  const evmChains = availableChains.filter((chain) => isEVMChain(chain.id));
  const cardanoChains = availableChains.filter((chain) => isCardanoChain(chain.id));

  const handleChainSelect = (chain: Chain) => {
    onSelect(chain);
    setIsOpen(false);
  };

  const ChainRow: React.FC<{ chain: Chain; isSelected: boolean }> = ({ chain, isSelected }) => (
    <motion.button
      onClick={() => handleChainSelect(chain)}
      className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
        isSelected
          ? 'bg-primary-50 border border-primary-200'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex items-center space-x-3">
        {/* Chain Icon */}
        <div className="relative w-8 h-8">
          <Image
            src={chain.iconUrl}
            alt={chain.name}
            fill
            className="rounded-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        {/* Chain Info */}
        <div className="text-left">
          <div className="font-semibold text-gray-900 dark:text-white">
            {chain.name}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {chain.nativeCurrency.symbol}
          </div>
        </div>
      </div>

      {/* Chain Type Badge */}
      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
        isCardanoChain(chain.id)
          ? 'bg-cardano-100 text-cardano-700 dark:bg-cardano-900 dark:text-cardano-300'
          : 'bg-ethereum-100 text-ethereum-700 dark:bg-ethereum-900 dark:text-ethereum-300'
      }`}>
        {isCardanoChain(chain.id) ? 'Cardano' : 'EVM'}
      </div>
    </motion.button>
  );

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <motion.button
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className={`flex items-center space-x-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600
                   rounded-lg hover:border-gray-300 dark:hover:border-gray-500 transition-colors ${
                     disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                   }`}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        {selectedChain ? (
          <>
            {/* Selected Chain */}
            <div className="flex items-center space-x-2">
              <div className="relative w-5 h-5">
                <Image
                  src={selectedChain.iconUrl}
                  alt={selectedChain.name}
                  fill
                  className="rounded-full object-cover"
                />
              </div>
              <span className="font-medium text-gray-900 dark:text-white text-sm">
                {selectedChain.shortName}
              </span>
            </div>
          </>
        ) : (
          <span className="text-gray-500 dark:text-gray-400 text-sm">Select Chain</span>
        )}

        {!disabled && (
          <FiChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </motion.button>

      {/* Chain Selection Modal */}
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
                  Select Network
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* Chain List */}
              <div className="max-h-96 overflow-y-auto">
                <div className="p-4 space-y-4">
                  {/* EVM Chains */}
                  {evmChains.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                        EVM Networks
                      </h4>
                      <div className="space-y-1">
                        {evmChains.map((chain) => (
                          <ChainRow
                            key={chain.id}
                            chain={chain}
                            isSelected={selectedChain?.id === chain.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cardano Chains */}
                  {cardanoChains.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Cardano Networks
                      </h4>
                      <div className="space-y-1">
                        {cardanoChains.map((chain) => (
                          <ChainRow
                            key={chain.id}
                            chain={chain}
                            isSelected={selectedChain?.id === chain.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-600">
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  More networks coming soon
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChainSelector;