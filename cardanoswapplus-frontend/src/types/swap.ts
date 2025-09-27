import { BigNumber } from 'bignumber.js';

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  balance?: BigNumber;
  chainId: number;
}

export interface Chain {
  id: number;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  iconUrl: string;
}

export interface SwapQuote {
  fromAmount: BigNumber;
  toAmount: BigNumber;
  fromToken: Token;
  toToken: Token;
  fromChain: Chain;
  toChain: Chain;
  estimatedGas: BigNumber;
  exchangeRate: BigNumber;
  priceImpact: BigNumber;
  fees: {
    networkFee: BigNumber;
    protocolFee: BigNumber;
    resolverFee: BigNumber;
  };
  route: SwapRoute[];
  estimatedTime: number; // in seconds
  slippage: number; // in basis points
}

export interface SwapRoute {
  protocol: string;
  percentage: number;
  fromTokenAddress: string;
  toTokenAddress: string;
}

export interface SwapParams {
  fromToken: Token;
  toToken: Token;
  fromChain: Chain;
  toChain: Chain;
  amount: BigNumber;
  recipient?: string;
  slippage: number; // in basis points (100 = 1%)
  deadline?: number; // unix timestamp
}

export interface SwapOrder {
  id: string;
  orderHash: string;
  maker: string;
  taker: string;
  fromToken: Token;
  toToken: Token;
  fromChain: Chain;
  toChain: Chain;
  fromAmount: BigNumber;
  toAmount: BigNumber;
  status: SwapStatus;
  createdAt: number;
  expiresAt: number;
  txHashes: {
    source?: string;
    destination?: string;
  };
  secret?: string;
  secretHash: string;
  escrowAddresses: {
    source?: string;
    destination?: string;
  };
  fees: {
    networkFee: BigNumber;
    protocolFee: BigNumber;
    resolverFee: BigNumber;
  };
}

export enum SwapStatus {
  PENDING = 'pending',
  QUOTED = 'quoted',
  CONFIRMING = 'confirming',
  SOURCE_PENDING = 'source_pending',
  SOURCE_CONFIRMED = 'source_confirmed',
  DESTINATION_PENDING = 'destination_pending',
  DESTINATION_CONFIRMED = 'destination_confirmed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  REFUNDING = 'refunding',
  REFUNDED = 'refunded'
}

export interface WalletConnection {
  address: string;
  chainId: number;
  isConnected: boolean;
  provider?: any;
  type: 'ethereum' | 'cardano';
}

export interface EthereumWallet extends WalletConnection {
  type: 'ethereum';
  provider: any; // ethers provider
}

export interface CardanoWallet extends WalletConnection {
  type: 'cardano';
  api?: any; // Cardano wallet API
  utxos?: any[];
}

export interface SwapSettings {
  slippage: number; // in basis points
  deadline: number; // in minutes
  autoRefresh: boolean;
  expertMode: boolean;
}

export interface PriceImpactLevel {
  level: 'low' | 'medium' | 'high' | 'very-high';
  color: string;
  threshold: number;
}

export interface GasEstimate {
  gasLimit: BigNumber;
  gasPrice: BigNumber;
  totalCost: BigNumber;
  feeToken: Token;
}

export interface SwapProgress {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  status: 'pending' | 'loading' | 'completed' | 'failed';
  txHash?: string;
  estimatedTime?: number;
}

export interface RelayerStatus {
  isOnline: boolean;
  activeOrders: number;
  avgProcessingTime: number;
  successRate: number;
  lastSeen: number;
}

export interface CrossChainRoute {
  sourceChain: Chain;
  destinationChain: Chain;
  sourceToken: Token;
  destinationToken: Token;
  protocols: string[];
  estimatedTime: number;
  fees: {
    bridgeFee: BigNumber;
    swapFee: BigNumber;
    gasFee: BigNumber;
  };
}