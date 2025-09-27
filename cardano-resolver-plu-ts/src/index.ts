#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { CardanoResolver } from './resolvers/cardano-resolver';
import { ResolverAPI } from './api/resolver-api';
import { ResolverConfig } from './types/resolver-types';

// Load environment variables
dotenv.config();

/**
 * Main entry point for Cardano Cross-Chain Resolver
 */
async function main() {
  console.log('🚀 Starting Cardano Cross-Chain Resolver...');

  // Configuration
  const config: ResolverConfig = {
    cardanoNetwork: (process.env.CARDANO_NETWORK as any) || 'testnet',
    blockfrostApiKey: process.env.BLOCKFROST_API_KEY || '',
    walletSeed: process.env.WALLET_SEED || '',
    evmRpcUrl: process.env.EVM_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/your-api-key',
    evmPrivateKey: process.env.EVM_PRIVATE_KEY || '',
    fusionApiKey: process.env.FUSION_API_KEY,
    minProfitBasisPoints: parseInt(process.env.MIN_PROFIT_BASIS_POINTS || '100'), // 1%
    maxSlippageBasisPoints: parseInt(process.env.MAX_SLIPPAGE_BASIS_POINTS || '300'), // 3%
    apiPort: parseInt(process.env.API_PORT || '3001'),
    webhookUrl: process.env.WEBHOOK_URL
  };

  // Validate configuration
  if (!config.blockfrostApiKey) {
    console.error('❌ BLOCKFROST_API_KEY is required');
    process.exit(1);
  }

  if (!config.walletSeed) {
    console.error('❌ WALLET_SEED is required');
    process.exit(1);
  }

  try {
    // Initialize resolver
    const resolver = new CardanoResolver(config);
    await resolver.initialize();

    // Set up event listeners
    resolver.on('dstDeployed', (event) => {
      console.log(`✅ Destination deployed: ${event.orderHash} - ${event.txHash}`);
    });

    resolver.on('orderCompleted', (event) => {
      console.log(`✅ Order completed: ${event.orderHash} - ${event.txHash}`);
    });

    resolver.on('orderCancelled', (event) => {
      console.log(`🚫 Order cancelled: ${event.orderHash} - ${event.txHash}`);
    });

    resolver.on('orderTimeout', (event) => {
      console.log(`⏰ Order timed out: ${event.orderHash}`);
    });

    resolver.on('srcFilled', (event) => {
      console.log(`📦 Source filled: ${event.orderHash}`);
    });

    resolver.on('secretRevealed', (event) => {
      console.log(`🔓 Secret revealed: ${event.orderHash}`);
    });

    // Start monitoring
    await resolver.startMonitoring();

    // Start API server
    const api = new ResolverAPI(resolver, config);
    await api.start();

    console.log('✅ Cardano Resolver fully operational');
    console.log(`📊 Monitoring ${resolver.getActiveOrders().length} active orders`);
    console.log(`💰 Minimum profit: ${config.minProfitBasisPoints} basis points`);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('🛑 Shutting down Cardano Resolver...');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start resolver:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}

export { CardanoResolver } from './resolvers/cardano-resolver';
export { ResolverAPI } from './api/resolver-api';
export * from './types/resolver-types';
export * from './contracts/cardano-escrow';