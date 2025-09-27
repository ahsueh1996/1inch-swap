export interface SwapStatus {
  PENDING = 'pending',
  AWAITING_SECRET = 'awaiting_secret',
  SECRET_SHARED = 'secret_shared',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export interface SwapParams {
  orderId: string;
  makerAddress: string;
  takerAddress: string;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  hashlock: string;
  userDeadline: number;
  cancelAfter: number;
  chainIdSrc: number;
  chainIdDst: number;
  escrowAddressSrc?: string;
  escrowAddressDst?: string;
}

export interface SwapRecord {
  id: string;
  orderId: string;
  status: keyof typeof SwapStatus;
  params: SwapParams;
  secret?: string;
  secretSharedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RelayerConfig {
  maxSecretHoldTime: number;
  validationTolerance: number;
  pollInterval: number;
  userDeadlineBuffer: number;
  cancelAfterBuffer: number;
  dbPath: string;
  port: number;
  apiSecret: string;
  ethRpcUrl: string;
  cardanoNodeUrl: string;
  cardanoProjectId: string;
  ipfsGateway?: string;
  ipfsProjectId?: string;
  ipfsProjectSecret?: string;
}

export interface ChainMonitor {
  chainId: number;
  rpcUrl: string;
  lastBlock: number;
}

export interface SecretRevealEvent {
  orderId: string;
  secret: string;
  blockNumber: number;
  transactionHash: string;
  timestamp: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LivenessCheck {
  orderId: string;
  secretSharedAt: number;
  deadline: number;
  graceExpired: boolean;
}