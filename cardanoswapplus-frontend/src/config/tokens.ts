import { Token } from '@/types/swap';
import {
  ETHEREUM_MAINNET,
  ETHEREUM_SEPOLIA,
  POLYGON_MAINNET,
  ARBITRUM_ONE,
  BSC_MAINNET,
  CARDANO_MAINNET,
  CARDANO_TESTNET
} from './chains';

// Ethereum Mainnet Tokens
export const ETH: Token = {
  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  symbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  logoURI: '/icons/eth.svg',
  chainId: ETHEREUM_MAINNET.id,
};

export const USDC_ETH: Token = {
  address: '0xA0b86a33E6441b4e6c5b83ce6F5E6a7CA8fC5E7B',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  logoURI: '/icons/usdc.svg',
  chainId: ETHEREUM_MAINNET.id,
};

export const USDT_ETH: Token = {
  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 6,
  logoURI: '/icons/usdt.svg',
  chainId: ETHEREUM_MAINNET.id,
};

export const WBTC_ETH: Token = {
  address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  symbol: 'WBTC',
  name: 'Wrapped Bitcoin',
  decimals: 8,
  logoURI: '/icons/wbtc.svg',
  chainId: ETHEREUM_MAINNET.id,
};

// Polygon Tokens
export const MATIC: Token = {
  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  symbol: 'MATIC',
  name: 'Polygon',
  decimals: 18,
  logoURI: '/icons/matic.svg',
  chainId: POLYGON_MAINNET.id,
};

export const USDC_POLYGON: Token = {
  address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  symbol: 'USDC',
  name: 'USD Coin (PoS)',
  decimals: 6,
  logoURI: '/icons/usdc.svg',
  chainId: POLYGON_MAINNET.id,
};

// Arbitrum Tokens
export const ETH_ARB: Token = {
  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  symbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  logoURI: '/icons/eth.svg',
  chainId: ARBITRUM_ONE.id,
};

export const USDC_ARB: Token = {
  address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  symbol: 'USDC',
  name: 'USD Coin (Arb1)',
  decimals: 6,
  logoURI: '/icons/usdc.svg',
  chainId: ARBITRUM_ONE.id,
};

// BSC Tokens
export const BNB: Token = {
  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  symbol: 'BNB',
  name: 'BNB',
  decimals: 18,
  logoURI: '/icons/bnb.svg',
  chainId: BSC_MAINNET.id,
};

export const USDT_BSC: Token = {
  address: '0x55d398326f99059fF775485246999027B3197955',
  symbol: 'USDT',
  name: 'Tether USD (BSC)',
  decimals: 18,
  logoURI: '/icons/usdt.svg',
  chainId: BSC_MAINNET.id,
};

// Cardano Tokens
export const ADA: Token = {
  address: '', // Native token has no address on Cardano
  symbol: 'ADA',
  name: 'Cardano',
  decimals: 6,
  logoURI: '/icons/ada.svg',
  chainId: CARDANO_MAINNET.id,
};

export const ADA_TESTNET: Token = {
  address: '',
  symbol: 'tADA',
  name: 'Test Cardano',
  decimals: 6,
  logoURI: '/icons/ada.svg',
  chainId: CARDANO_TESTNET.id,
};

// Example Cardano native tokens
export const DJED: Token = {
  address: '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65640',
  symbol: 'DJED',
  name: 'DJED',
  decimals: 6,
  logoURI: '/icons/djed.svg',
  chainId: CARDANO_MAINNET.id,
};

export const MIN_ADA: Token = {
  address: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e',
  symbol: 'MIN',
  name: 'Minswap',
  decimals: 6,
  logoURI: '/icons/min.svg',
  chainId: CARDANO_MAINNET.id,
};

// Sepolia Testnet Tokens (for testing)
export const ETH_SEPOLIA: Token = {
  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  symbol: 'ETH',
  name: 'Sepolia Ether',
  decimals: 18,
  logoURI: '/icons/eth.svg',
  chainId: ETHEREUM_SEPOLIA.id,
};

export const USDC_SEPOLIA: Token = {
  address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  symbol: 'USDC',
  name: 'USD Coin (Sepolia)',
  decimals: 6,
  logoURI: '/icons/usdc.svg',
  chainId: ETHEREUM_SEPOLIA.id,
};

// Token lists by chain
export const ETHEREUM_TOKENS = [ETH, USDC_ETH, USDT_ETH, WBTC_ETH];
export const ETHEREUM_SEPOLIA_TOKENS = [ETH_SEPOLIA, USDC_SEPOLIA];
export const POLYGON_TOKENS = [MATIC, USDC_POLYGON];
export const ARBITRUM_TOKENS = [ETH_ARB, USDC_ARB];
export const BSC_TOKENS = [BNB, USDT_BSC];
export const CARDANO_MAINNET_TOKENS = [ADA, DJED, MIN_ADA];
export const CARDANO_TESTNET_TOKENS = [ADA_TESTNET];

export const TOKEN_LISTS: Record<number, Token[]> = {
  [ETHEREUM_MAINNET.id]: ETHEREUM_TOKENS,
  [ETHEREUM_SEPOLIA.id]: ETHEREUM_SEPOLIA_TOKENS,
  [POLYGON_MAINNET.id]: POLYGON_TOKENS,
  [ARBITRUM_ONE.id]: ARBITRUM_TOKENS,
  [BSC_MAINNET.id]: BSC_TOKENS,
  [CARDANO_MAINNET.id]: CARDANO_MAINNET_TOKENS,
  [CARDANO_TESTNET.id]: CARDANO_TESTNET_TOKENS,
};

export const getTokensByChain = (chainId: number): Token[] => {
  return TOKEN_LISTS[chainId] || [];
};

export const getTokenByAddress = (chainId: number, address: string): Token | undefined => {
  const tokens = getTokensByChain(chainId);
  return tokens.find(token =>
    token.address.toLowerCase() === address.toLowerCase()
  );
};

export const getNativeToken = (chainId: number): Token | undefined => {
  const tokens = getTokensByChain(chainId);
  return tokens.find(token =>
    token.address === '' ||
    token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
  );
};

export const isNativeToken = (token: Token): boolean => {
  return token.address === '' ||
         token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
};

// Popular token pairs for quick swap
export const POPULAR_PAIRS = [
  { from: ETH, to: ADA },
  { from: USDC_ETH, to: ADA },
  { from: ADA, to: ETH },
  { from: ADA, to: USDC_ETH },
  { from: MATIC, to: ADA },
  { from: BNB, to: ADA },
];

// Stable coins
export const STABLE_COINS = [USDC_ETH, USDT_ETH, USDC_POLYGON, USDC_ARB, USDT_BSC];

export const isStableCoin = (token: Token): boolean => {
  return STABLE_COINS.some(stableCoin =>
    stableCoin.address.toLowerCase() === token.address.toLowerCase() &&
    stableCoin.chainId === token.chainId
  );
};