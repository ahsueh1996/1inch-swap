'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FiWallet } from 'react-icons/fi';
import Image from 'next/image';

import { Chain } from '@/types/swap';
import { isCardanoChain } from '@/config/chains';

interface WalletConnectorProps {
  chain: Chain;
  onConnect: () => void;
  className?: string;
}

const WalletConnector: React.FC<WalletConnectorProps> = ({
  chain,
  onConnect,
  className = '',
}) => {
  const isCardano = isCardanoChain(chain.id);

  return (
    <motion.button
      onClick={onConnect}
      className={`w-full flex items-center justify-center space-x-3 py-3 px-4
                 border-2 border-dashed border-gray-300 dark:border-gray-600
                 rounded-lg hover:border-primary-400 dark:hover:border-primary-500
                 hover:bg-primary-50 dark:hover:bg-primary-900/20
                 transition-colors group ${className}`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="relative w-6 h-6">
        <Image
          src={chain.iconUrl}
          alt={chain.name}
          fill
          className="rounded-full object-cover"
        />
      </div>

      <div className="flex items-center space-x-2">
        <FiWallet className="w-5 h-5 text-gray-400 group-hover:text-primary-500" />
        <span className="font-medium text-gray-700 dark:text-gray-300 group-hover:text-primary-600 dark:group-hover:text-primary-400">
          Connect {isCardano ? 'Cardano' : 'Ethereum'} Wallet
        </span>
      </div>
    </motion.button>
  );
};

export default WalletConnector;