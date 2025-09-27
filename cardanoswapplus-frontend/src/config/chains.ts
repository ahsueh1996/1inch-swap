import { Chain } from '@/types/swap';

export const ETHEREUM_MAINNET: Chain = {
  id: 1,
  name: 'Ethereum Mainnet',
  shortName: 'ETH',
  rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth-mainnet.alchemyapi.io/v2/demo',
  explorerUrl: 'https://etherscan.io',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  iconUrl: '/icons/ethereum.svg',
};

export const ETHEREUM_SEPOLIA: Chain = {
  id: 11155111,
  name: 'Ethereum Sepolia',
  shortName: 'ETH',
  rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/demo',
  explorerUrl: 'https://sepolia.etherscan.io',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  iconUrl: '/icons/ethereum.svg',
};

export const POLYGON_MAINNET: Chain = {
  id: 137,
  name: 'Polygon Mainnet',
  shortName: 'MATIC',
  rpcUrl: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com',
  explorerUrl: 'https://polygonscan.com',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'MATIC',
    decimals: 18,
  },
  iconUrl: '/icons/polygon.svg',
};

export const ARBITRUM_ONE: Chain = {
  id: 42161,
  name: 'Arbitrum One',
  shortName: 'ARB',
  rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  explorerUrl: 'https://arbiscan.io',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  iconUrl: '/icons/arbitrum.svg',
};

export const BSC_MAINNET: Chain = {
  id: 56,
  name: 'BNB Smart Chain',
  shortName: 'BSC',
  rpcUrl: process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
  explorerUrl: 'https://bscscan.com',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  iconUrl: '/icons/bnb.svg',
};

// Virtual chain for Cardano
export const CARDANO_MAINNET: Chain = {
  id: 2147483648, // Using high ID to avoid conflicts with EVM chains
  name: 'Cardano Mainnet',
  shortName: 'ADA',
  rpcUrl: 'https://cardano-mainnet.blockfrost.io/api/v0',
  explorerUrl: 'https://cardanoscan.io',
  nativeCurrency: {
    name: 'Cardano',
    symbol: 'ADA',
    decimals: 6, // Cardano uses 6 decimals for ADA
  },
  iconUrl: '/icons/cardano.svg',
};

export const CARDANO_TESTNET: Chain = {
  id: 2147483649,
  name: 'Cardano Testnet',
  shortName: 'ADA',
  rpcUrl: 'https://cardano-testnet.blockfrost.io/api/v0',
  explorerUrl: 'https://testnet.cardanoscan.io',
  nativeCurrency: {
    name: 'Test Cardano',
    symbol: 'tADA',
    decimals: 6,
  },
  iconUrl: '/icons/cardano.svg',
};

export const SUPPORTED_EVM_CHAINS = [
  ETHEREUM_MAINNET,
  ETHEREUM_SEPOLIA,
  POLYGON_MAINNET,
  ARBITRUM_ONE,
  BSC_MAINNET,
];

export const SUPPORTED_CARDANO_CHAINS = [
  CARDANO_MAINNET,
  CARDANO_TESTNET,
];

export const ALL_SUPPORTED_CHAINS = [
  ...SUPPORTED_EVM_CHAINS,
  ...SUPPORTED_CARDANO_CHAINS,
];

export const getChainById = (chainId: number): Chain | undefined => {
  return ALL_SUPPORTED_CHAINS.find(chain => chain.id === chainId);
};

export const isCardanoChain = (chainId: number): boolean => {
  return SUPPORTED_CARDANO_CHAINS.some(chain => chain.id === chainId);
};

export const isEVMChain = (chainId: number): boolean => {
  return SUPPORTED_EVM_CHAINS.some(chain => chain.id === chainId);
};

export const getDefaultChainPair = (): { source: Chain; destination: Chain } => {
  return {
    source: ETHEREUM_MAINNET,
    destination: CARDANO_MAINNET,
  };
};