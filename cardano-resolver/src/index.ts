import { config } from 'dotenv';
import { CardanoResolver, ResolverConfig } from './resolver';

// Load environment variables
config();

async function main() {
  const resolverConfig: ResolverConfig = {
    fusionEndpoint: process.env.FUSION_ENDPOINT || 'wss://fusion.1inch.io/ws',
    evmRpcUrl: process.env.EVM_RPC_URL || 'https://eth-mainnet.alchemyapi.io/v2/demo',
    cardanoNetwork: (process.env.CARDANO_NETWORK as 'mainnet' | 'testnet') || 'testnet',
    blockfrostApiKey: process.env.BLOCKFROST_API_KEY || '',
    resolverPrivateKey: process.env.RESOLVER_PRIVATE_KEY || '',
    minProfitBasisPoints: parseInt(process.env.MIN_PROFIT_BASIS_POINTS || '50'),
    dbPath: process.env.DB_PATH || './data/resolver.db',
    fusionApiKey: process.env.FUSION_API_KEY,
    refundTimeoutHours: parseInt(process.env.REFUND_TIMEOUT_HOURS || '24')
  };

  // Validate required configuration
  if (!resolverConfig.blockfrostApiKey) {
    console.error('❌ BLOCKFROST_API_KEY is required');
    process.exit(1);
  }

  if (!resolverConfig.resolverPrivateKey) {
    console.error('❌ RESOLVER_PRIVATE_KEY is required');
    process.exit(1);
  }

  try {
    // Create and start the resolver
    const resolver = new CardanoResolver(resolverConfig);

    // Set up event handlers
    resolver.on('swapCompleted', ({ orderHash, swap }) => {
      console.log(`🎉 Swap completed: ${orderHash}`);
      console.log(`💰 Profit: ${swap.order.makingAmount - swap.order.takingAmount}`);
    });

    resolver.on('swapCancelled', ({ orderHash, swap }) => {
      console.log(`❌ Swap cancelled: ${orderHash}`);
    });

    resolver.on('refundCompleted', ({ orderHash }) => {
      console.log(`💸 Refund completed: ${orderHash}`);
    });

    resolver.on('error', (error) => {
      console.error('🚨 Resolver error:', error);
    });

    // Start the resolver
    await resolver.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('🛑 Shutting down resolver...');

      // Get final stats
      const stats = await resolver.getActiveSwapsCount();
      console.log(`📊 Active swaps at shutdown: ${stats}`);

      process.exit(0);
    });

    // Display status every 5 minutes
    setInterval(async () => {
      const activeSwaps = resolver.getActiveSwapsCount();
      console.log(`📊 Status: ${activeSwaps} active swaps`);
    }, 300000);

  } catch (error) {
    console.error('💥 Failed to start resolver:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
main().catch(console.error);