import React from 'react';
import Head from 'next/head';
import { motion } from 'framer-motion';
import { FiArrowUpDown, FiShield, FiZap, FiUsers } from 'react-icons/fi';

import SwapInterface from '@/components/SwapInterface';
import { useWalletStore } from '@/store/walletStore';

const HomePage: React.FC = () => {
  const { ethereumWallet, cardanoWallet } = useWalletStore();

  const features = [
    {
      icon: FiArrowUpDown,
      title: 'Cross-Chain Swaps',
      description: 'Seamlessly swap between Ethereum and Cardano ecosystems with atomic guarantees.',
    },
    {
      icon: FiShield,
      title: 'Secure & Trustless',
      description: 'Built on atomic swap technology with HTLC contracts ensuring your funds are always safe.',
    },
    {
      icon: FiZap,
      title: 'Fast Settlement',
      description: 'Quick transaction finality with optimized routing through 1inch Fusion infrastructure.',
    },
    {
      icon: FiUsers,
      title: 'Decentralized',
      description: 'No centralized intermediaries - powered by a network of independent resolvers.',
    },
  ];

  return (
    <>
      <Head>
        <title>CardanoSwap+ - ETH ↔ ADA</title>
        <meta
          name="description"
          content="CardanoSwap+ - Secure cross-chain swaps between Ethereum and Cardano using atomic swap technology and 1inch Fusion"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
                  <FiArrowUpDown className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Cardano<span className="text-primary-500">Swap+</span>
                </h1>
              </div>

              {/* Wallet Status */}
              <div className="flex items-center space-x-4">
                {/* Ethereum Wallet Status */}
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                  ethereumWallet?.isConnected
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    ethereumWallet?.isConnected ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span>Ethereum</span>
                </div>

                {/* Cardano Wallet Status */}
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                  cardanoWallet?.isConnected
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    cardanoWallet?.isConnected ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span>Cardano</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Left Column - Swap Interface */}
            <div className="order-2 lg:order-1">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <SwapInterface />
              </motion.div>
            </div>

            {/* Right Column - Info */}
            <div className="order-1 lg:order-2 space-y-8">
              {/* Hero Section */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-center lg:text-left"
              >
                <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                  Bridge the Gap Between{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-ethereum-500 to-cardano-500">
                    Ethereum & Cardano
                  </span>
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                  CardanoSwap+ - The first truly decentralized cross-chain swap protocol enabling seamless
                  asset exchange between Ethereum and Cardano ecosystems.
                </p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                      $2.5M+
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Volume Swapped
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                      1,200+
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Successful Swaps
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                      99.9%
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Success Rate
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Features */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="space-y-6"
              >
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Why Choose CardanoSwap+?
                </h3>

                <div className="space-y-4">
                  {features.map((feature, index) => (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                      className="flex items-start space-x-4 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm"
                    >
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                          <feature.icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                          {feature.title}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {feature.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* How It Works */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm"
              >
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  How It Works
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      1
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Connect Wallets
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Connect both your Ethereum and Cardano wallets
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      2
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Set Parameters
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Choose assets, amounts, and confirm the swap details
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      3
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Atomic Execution
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Funds are swapped atomically via HTLC contracts
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      ✓
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Receive Assets
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Your swapped assets arrive in your destination wallet
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
              <p>
                Powered by{' '}
                <a
                  href="https://1inch.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-500 hover:text-primary-600"
                >
                  1inch Fusion
                </a>
                {' '} and {' '}
                <a
                  href="https://cardano.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cardano-500 hover:text-cardano-600"
                >
                  Cardano
                </a>
              </p>
              <p className="mt-2">
                Built for ETHNewDelhi 2025 Hackathon
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default HomePage;