import axios, { AxiosInstance } from 'axios';
import { BigNumber } from 'bignumber.js';
import Sdk from '@1inch/cross-chain-sdk';
import { ethers } from 'ethers';

import { SwapQuote, SwapParams, Token, Chain, SwapOrder, SwapStatus } from '@/types/swap';
import { isCardanoChain, isEVMChain } from '@/config/chains';

interface OneInchQuoteParams {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  fromAddress?: string;
  slippage?: number;
  destReceiver?: string;
  referrerAddress?: string;
  fee?: number;
  gasPrice?: string;
  parts?: number;
  connectorTokens?: string;
  complexityLevel?: number;
  mainRouteParts?: number;
  gasLimit?: number;
  includeTokensInfo?: boolean;
  includeProtocols?: boolean;
  includeGas?: boolean;
}

interface OneInchQuoteResponse {
  fromToken: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
  };
  toToken: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
  };
  toTokenAmount: string;
  fromTokenAmount: string;
  protocols: Array<Array<{
    name: string;
    part: number;
    fromTokenAddress: string;
    toTokenAddress: string;
  }>>;
  estimatedGas: number;
}

interface OneInchSwapParams extends OneInchQuoteParams {
  fromAddress: string;
  slippage: number;
}

interface OneInchSwapResponse {
  fromToken: any;
  toToken: any;
  toTokenAmount: string;
  fromTokenAmount: string;
  protocols: any[];
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gasPrice: string;
    gas: number;
  };
}

interface FusionOrderParams {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  fromAddress: string;
  receiver?: string;
  preset?: 'fast' | 'medium' | 'slow';
  fee?: {
    takingFeePercent?: number;
    takingFeeReceiver?: string;
  };
  source?: string;
}

interface FusionOrderResponse {
  orderHash: string;
  order: {
    maker: string;
    makerAsset: string;
    takerAsset: string;
    makingAmount: string;
    takingAmount: string;
    salt: string;
    receiver: string;
    allowedSender: string;
    interactions: string;
    deadline: number;
  };
  extension: {
    makingAmountData: string;
    takingAmountData: string;
    predicate: string;
    permitData: string;
    preInteractionData: string;
    postInteractionData: string;
  };
  signature: string;
  hash: string;
  auctionStartDate: number;
  auctionEndDate: number;
}

class OneInchService {
  private apiClient: AxiosInstance;
  private fusionClient: AxiosInstance;
  private crossChainSdk: Sdk | null = null;

  constructor() {
    // 1inch API v5.0
    this.apiClient = axios.create({
      baseURL: 'https://api.1inch.io/v5.0',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // 1inch Fusion API
    this.fusionClient = axios.create({
      baseURL: 'https://api.1inch.io/fusion',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    this.initializeCrossChainSdk();
  }

  private async initializeCrossChainSdk() {
    try {
      // Initialize 1inch Cross-Chain SDK
      this.crossChainSdk = new Sdk({
        authKey: process.env.NEXT_PUBLIC_ONEINCH_API_KEY,
        blockchainProvider: {
          // Add supported blockchain providers
          1: new ethers.providers.JsonRpcProvider(process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL),
          137: new ethers.providers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL),
          42161: new ethers.providers.JsonRpcProvider(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL),
          56: new ethers.providers.JsonRpcProvider(process.env.NEXT_PUBLIC_BSC_RPC_URL),
        },
      });
    } catch (error) {
      console.error('Failed to initialize 1inch Cross-Chain SDK:', error);
    }
  }

  /**
   * Get a quote for a regular EVM-to-EVM swap
   */
  async getQuote(params: SwapParams): Promise<SwapQuote> {
    try {
      const { fromToken, toToken, fromChain, toChain, amount, slippage } = params;

      // Handle cross-chain swaps differently
      if (fromChain.id !== toChain.id) {
        return this.getCrossChainQuote(params);
      }

      // Regular same-chain swap
      const quoteParams: OneInchQuoteParams = {
        fromTokenAddress: fromToken.address,
        toTokenAddress: toToken.address,
        amount: amount.multipliedBy(new BigNumber(10).pow(fromToken.decimals)).toFixed(0),
        slippage: slippage / 100, // Convert from basis points to percentage
        includeTokensInfo: true,
        includeProtocols: true,
        includeGas: true,
      };

      const response = await this.apiClient.get<OneInchQuoteResponse>(
        `/${fromChain.id}/quote`,
        { params: quoteParams }
      );

      const data = response.data;

      // Calculate exchange rate
      const fromAmountBN = new BigNumber(data.fromTokenAmount).dividedBy(
        new BigNumber(10).pow(fromToken.decimals)
      );
      const toAmountBN = new BigNumber(data.toTokenAmount).dividedBy(
        new BigNumber(10).pow(toToken.decimals)
      );
      const exchangeRate = toAmountBN.dividedBy(fromAmountBN);

      // Estimate gas cost
      const gasEstimate = new BigNumber(data.estimatedGas);
      const gasPrice = new BigNumber(20).multipliedBy(new BigNumber(10).pow(9)); // 20 gwei default
      const gasCost = gasEstimate.multipliedBy(gasPrice).dividedBy(new BigNumber(10).pow(18));

      return {
        fromAmount: fromAmountBN,
        toAmount: toAmountBN,
        fromToken,
        toToken,
        fromChain,
        toChain,
        estimatedGas: gasEstimate,
        exchangeRate,
        priceImpact: new BigNumber(0), // Calculate if needed
        fees: {
          networkFee: gasCost,
          protocolFee: new BigNumber(0),
          resolverFee: new BigNumber(0),
        },
        route: data.protocols.flat().map(protocol => ({
          protocol: protocol.name,
          percentage: protocol.part,
          fromTokenAddress: protocol.fromTokenAddress,
          toTokenAddress: protocol.toTokenAddress,
        })),
        estimatedTime: 60, // 1 minute for same-chain swaps
        slippage,
      };
    } catch (error) {
      console.error('Failed to get 1inch quote:', error);
      throw new Error('Failed to get swap quote');
    }
  }

  /**
   * Get a quote for cross-chain swaps (including Cardano)
   */
  async getCrossChainQuote(params: SwapParams): Promise<SwapQuote> {
    try {
      const { fromToken, toToken, fromChain, toChain, amount, slippage } = params;

      // If involving Cardano, use Fusion for cross-chain atomic swaps
      if (isCardanoChain(fromChain.id) || isCardanoChain(toChain.id)) {
        return this.getFusionCrossChainQuote(params);
      }

      // EVM-to-EVM cross-chain using 1inch Cross-Chain SDK
      if (!this.crossChainSdk) {
        throw new Error('Cross-chain SDK not initialized');
      }

      // Use the cross-chain SDK for EVM-to-EVM bridges
      const quote = await this.crossChainSdk.getQuote({
        srcChainId: fromChain.id,
        dstChainId: toChain.id,
        srcTokenAddress: fromToken.address,
        dstTokenAddress: toToken.address,
        amount: amount.multipliedBy(new BigNumber(10).pow(fromToken.decimals)).toFixed(0),
        slippage: slippage / 10000, // Convert from basis points
      });

      return {
        fromAmount: amount,
        toAmount: new BigNumber(quote.dstTokenAmount).dividedBy(
          new BigNumber(10).pow(toToken.decimals)
        ),
        fromToken,
        toToken,
        fromChain,
        toChain,
        estimatedGas: new BigNumber(quote.gas || 200000),
        exchangeRate: new BigNumber(quote.dstTokenAmount)
          .dividedBy(new BigNumber(10).pow(toToken.decimals))
          .dividedBy(amount),
        priceImpact: new BigNumber(0),
        fees: {
          networkFee: new BigNumber(quote.srcTokenFeeAmount || 0).dividedBy(
            new BigNumber(10).pow(fromToken.decimals)
          ),
          protocolFee: new BigNumber(0),
          resolverFee: new BigNumber(0),
        },
        route: [
          {
            protocol: '1inch Bridge',
            percentage: 100,
            fromTokenAddress: fromToken.address,
            toTokenAddress: toToken.address,
          },
        ],
        estimatedTime: 600, // 10 minutes for cross-chain
        slippage,
      };
    } catch (error) {
      console.error('Failed to get cross-chain quote:', error);
      throw new Error('Failed to get cross-chain quote');
    }
  }

  /**
   * Get a quote for Fusion-based cross-chain swaps (including Cardano)
   */
  async getFusionCrossChainQuote(params: SwapParams): Promise<SwapQuote> {
    try {
      const { fromToken, toToken, fromChain, toChain, amount, slippage } = params;

      // For now, provide a mock quote structure for Cardano swaps
      // In a real implementation, this would integrate with the actual
      // Cardano resolver and pricing oracles

      const mockExchangeRate = new BigNumber(1500); // Mock ADA/ETH rate
      const estimatedToAmount = isCardanoChain(toChain.id)
        ? amount.multipliedBy(mockExchangeRate)
        : amount.dividedBy(mockExchangeRate);

      return {
        fromAmount: amount,
        toAmount: estimatedToAmount,
        fromToken,
        toToken,
        fromChain,
        toChain,
        estimatedGas: new BigNumber(300000),
        exchangeRate: mockExchangeRate,
        priceImpact: new BigNumber(50), // 0.5% price impact
        fees: {
          networkFee: new BigNumber(0.01), // Mock network fee
          protocolFee: new BigNumber(0.003), // 0.3% protocol fee
          resolverFee: new BigNumber(0.002), // 0.2% resolver fee
        },
        route: [
          {
            protocol: 'Cardano Bridge',
            percentage: 100,
            fromTokenAddress: fromToken.address,
            toTokenAddress: toToken.address,
          },
        ],
        estimatedTime: 1800, // 30 minutes for Cardano cross-chain
        slippage,
      };
    } catch (error) {
      console.error('Failed to get Fusion cross-chain quote:', error);
      throw new Error('Failed to get Fusion cross-chain quote');
    }
  }

  /**
   * Execute a regular EVM swap
   */
  async executeSwap(
    params: SwapParams,
    fromAddress: string,
    signer: ethers.Signer
  ): Promise<string> {
    try {
      const { fromToken, toToken, fromChain, amount, slippage } = params;

      const swapParams: OneInchSwapParams = {
        fromTokenAddress: fromToken.address,
        toTokenAddress: toToken.address,
        amount: amount.multipliedBy(new BigNumber(10).pow(fromToken.decimals)).toFixed(0),
        fromAddress,
        slippage: slippage / 100,
      };

      const response = await this.apiClient.get<OneInchSwapResponse>(
        `/${fromChain.id}/swap`,
        { params: swapParams }
      );

      const txData = response.data.tx;

      // Execute transaction
      const tx = await signer.sendTransaction({
        to: txData.to,
        data: txData.data,
        value: txData.value,
        gasPrice: txData.gasPrice,
        gasLimit: txData.gas,
      });

      return tx.hash;
    } catch (error) {
      console.error('Failed to execute swap:', error);
      throw new Error('Failed to execute swap');
    }
  }

  /**
   * Create a Fusion order for cross-chain atomic swaps
   */
  async createFusionOrder(
    params: SwapParams,
    fromAddress: string,
    signer: ethers.Signer
  ): Promise<SwapOrder> {
    try {
      const { fromToken, toToken, fromChain, toChain, amount, slippage } = params;

      const orderParams: FusionOrderParams = {
        fromTokenAddress: fromToken.address,
        toTokenAddress: toToken.address,
        amount: amount.multipliedBy(new BigNumber(10).pow(fromToken.decimals)).toFixed(0),
        fromAddress,
        preset: 'medium',
        source: 'cross-chain-swap-ui',
      };

      const response = await this.fusionClient.post<FusionOrderResponse>(
        '/order',
        orderParams
      );

      const orderData = response.data;

      // Sign and submit the order
      const signature = await signer.signMessage(orderData.hash);

      return {
        id: orderData.orderHash,
        orderHash: orderData.orderHash,
        maker: orderData.order.maker,
        taker: orderData.order.allowedSender,
        fromToken,
        toToken,
        fromChain,
        toChain,
        fromAmount: amount,
        toAmount: new BigNumber(orderData.order.takingAmount).dividedBy(
          new BigNumber(10).pow(toToken.decimals)
        ),
        status: SwapStatus.PENDING,
        createdAt: Date.now(),
        expiresAt: orderData.order.deadline * 1000,
        txHashes: {},
        secretHash: '', // Will be generated by resolver
        escrowAddresses: {},
        fees: {
          networkFee: new BigNumber(0),
          protocolFee: new BigNumber(0),
          resolverFee: new BigNumber(0),
        },
      };
    } catch (error) {
      console.error('Failed to create Fusion order:', error);
      throw new Error('Failed to create Fusion order');
    }
  }

  /**
   * Get supported tokens for a chain
   */
  async getSupportedTokens(chainId: number): Promise<Token[]> {
    try {
      const response = await this.apiClient.get(`/${chainId}/tokens`);
      const tokens = response.data.tokens;

      return Object.values(tokens).map((token: any) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI,
        chainId,
      }));
    } catch (error) {
      console.error('Failed to get supported tokens:', error);
      return [];
    }
  }

  /**
   * Get token prices
   */
  async getTokenPrices(chainId: number, tokenAddresses: string[]): Promise<Record<string, number>> {
    try {
      const addresses = tokenAddresses.join(',');
      const response = await this.apiClient.get(`/${chainId}/token-price`, {
        params: { addresses },
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get token prices:', error);
      return {};
    }
  }

  /**
   * Check Fusion order status
   */
  async getFusionOrderStatus(orderHash: string): Promise<SwapStatus> {
    try {
      const response = await this.fusionClient.get(`/order/${orderHash}`);
      const order = response.data;

      // Map Fusion status to our SwapStatus enum
      switch (order.status) {
        case 'pending':
          return SwapStatus.PENDING;
        case 'filled':
          return SwapStatus.COMPLETED;
        case 'cancelled':
          return SwapStatus.CANCELLED;
        case 'expired':
          return SwapStatus.EXPIRED;
        default:
          return SwapStatus.PENDING;
      }
    } catch (error) {
      console.error('Failed to get Fusion order status:', error);
      return SwapStatus.FAILED;
    }
  }
}

export const oneInchService = new OneInchService();