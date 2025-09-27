import { Address } from "@harmoniclabs/plu-ts";
import { UTxO } from "lucid-cardano";

/**
 * Cross-chain order interface for Cardano resolver
 */
export interface CrossChainOrder {
  orderHash: string;
  maker: string;
  taker?: string;
  srcChainId: number;
  dstChainId: string; // 'cardano' for destination
  makerAsset: {
    token: string;
    amount: bigint;
  };
  takerAsset: {
    policyId: string;
    assetName: string;
    amount: bigint;
  };
  salt: bigint;
  deadline: number;
  hashLock: string;
  timeLocks: {
    srcWithdrawal: number;
    srcPublicWithdrawal: number;
    srcCancellation: number;
    srcPublicCancellation: number;
    dstWithdrawal: number;
    dstPublicWithdrawal: number;
    dstCancellation: number;
  };
  safetyDeposit: {
    src: bigint;
    dst: bigint;
  };
  auction?: {
    startTime: number;
    duration: number;
    initialRateBump: number;
    points: Array<{ delay: number; coefficient: number }>;
  };
  whitelist?: Array<{
    address: string;
    allowFrom: number;
  }>;
  allowPartialFills: boolean;
  allowMultipleFills: boolean;
}

/**
 * Cardano-specific escrow parameters
 */
export interface CardanoEscrowParams {
  maker: string;
  resolver: string;
  beneficiary: string;
  asset: {
    policyId: string;
    assetName: string;
  };
  amount: bigint;
  hashlock: string;
  userDeadline: number;
  cancelAfter: number;
  depositLovelace: bigint;
  orderHash: string;
  fillId: number;
  merkleRoot?: string;
}

/**
 * Order fulfillment status
 */
export interface OrderStatus {
  orderHash: string;
  status: 'pending' | 'src_filled' | 'dst_deployed' | 'completing' | 'completed' | 'cancelled' | 'expired';
  srcTxHash?: string;
  dstTxHash?: string;
  secret?: string;
  createdAt: Date;
  updatedAt: Date;
  resolver: string;
  fillAmount: bigint;
  remainingAmount: bigint;
}

/**
 * Resolver configuration
 */
export interface ResolverConfig {
  cardanoNetwork: 'Mainnet' | 'Preview' | 'Preprod';
  blockfrostApiKey: string;
  walletSeed: string;
  evmRpcUrl: string;
  evmPrivateKey: string;
  fusionApiKey?: string;
  minProfitBasisPoints: number;
  maxSlippageBasisPoints: number;
  dbPath?: string;
  apiPort: number;
  webhookUrl?: string;
}

/**
 * Transaction result
 */
export interface TxResult {
  txHash: string;
  success: boolean;
  error?: string;
  blockHeight?: number;
  timestamp?: Date;
}

/**
 * Secret management
 */
export interface SecretInfo {
  secret: string;
  hash: string;
  orderHash: string;
  revealed: boolean;
  revealedAt?: Date;
  txHash?: string;
}

/**
 * Cardano UTXO with escrow data
 */
export interface EscrowUtxo extends UTxO {
  escrowData?: {
    orderHash: string;
    amount: bigint;
    deadline: number;
    resolver: string;
    beneficiary: string;
  };
}

/**
 * Cross-chain bridge event
 */
export interface BridgeEvent {
  type: 'order_created' | 'src_filled' | 'dst_deployed' | 'secret_revealed' | 'cancelled';
  orderHash: string;
  chainId: number | string;
  txHash: string;
  blockNumber: number;
  timestamp: Date;
  data: any;
}

/**
 * Profitability calculation
 */
export interface ProfitCalculation {
  grossProfit: bigint;
  gasCosts: bigint;
  cardanoFees: bigint;
  netProfit: bigint;
  profitBasisPoints: number;
  isProfitable: boolean;
}