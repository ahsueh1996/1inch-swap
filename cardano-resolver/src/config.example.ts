import { ResolverConfig } from './resolver';

export const exampleConfig: ResolverConfig = {
  // 1inch Fusion endpoint
  fusionEndpoint: 'wss://fusion.1inch.io/ws',

  // EVM RPC URL (Ethereum mainnet/testnet)
  evmRpcUrl: process.env.EVM_RPC_URL || 'https://eth-mainnet.alchemyapi.io/v2/your-api-key',

  // Cardano network configuration
  cardanoNetwork: 'testnet', // or 'mainnet'
  blockfrostApiKey: process.env.BLOCKFROST_API_KEY || 'your-blockfrost-api-key',

  // Resolver wallet private key
  resolverPrivateKey: process.env.RESOLVER_PRIVATE_KEY || '0x...',

  // Minimum profit in basis points (100 = 1%)
  minProfitBasisPoints: 50, // 0.5% minimum profit

  // Database configuration
  dbPath: './data/resolver.db',

  // Optional 1inch Fusion API key for enhanced features
  fusionApiKey: process.env.FUSION_API_KEY,

  // Refund timeout in hours
  refundTimeoutHours: 24
};

// Environment variables template
export const envTemplate = `
# EVM Configuration
EVM_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/your-api-key
RESOLVER_PRIVATE_KEY=0x1234567890abcdef...

# Cardano Configuration
BLOCKFROST_API_KEY=your-blockfrost-api-key

# 1inch Fusion Configuration
FUSION_API_KEY=your-fusion-api-key

# Resolver Settings
MIN_PROFIT_BASIS_POINTS=50
REFUND_TIMEOUT_HOURS=24
DB_PATH=./data/resolver.db
`;