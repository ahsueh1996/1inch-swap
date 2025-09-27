import { RelayerConfig } from "../types/index.js";
import dotenv from 'dotenv';

dotenv.config();

export function loadConfig(): RelayerConfig {
  const config: RelayerConfig = {
    maxSecretHoldTime: parseInt(process.env.MAX_SECRET_HOLD_TIME || '300'),
    validationTolerance: parseFloat(process.env.VALIDATION_TOLERANCE || '0.01'),
    pollInterval: parseInt(process.env.POLL_INTERVAL || '10000'),
    userDeadlineBuffer: parseInt(process.env.USER_DEADLINE_BUFFER || '3600'),
    cancelAfterBuffer: parseInt(process.env.CANCEL_AFTER_BUFFER || '7200'),
    dbPath: process.env.DB_PATH || './swaps.db',
    port: parseInt(process.env.PORT || '3000'),
    apiSecret: process.env.API_SECRET || 'default_secret',
    ethRpcUrl: process.env.ETH_RPC_URL || '',
    cardanoNodeUrl: process.env.CARDANO_NODE_URL || '',
    cardanoProjectId: process.env.CARDANO_PROJECT_ID || '',
    ipfsGateway: process.env.IPFS_GATEWAY,
    ipfsProjectId: process.env.IPFS_PROJECT_ID,
    ipfsProjectSecret: process.env.IPFS_PROJECT_SECRET
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: RelayerConfig): void {
  const required = [
    'ethRpcUrl',
    'cardanoNodeUrl',
    'cardanoProjectId'
  ];

  for (const field of required) {
    if (!config[field as keyof RelayerConfig]) {
      throw new Error(`Missing required configuration: ${field}`);
    }
  }

  if (config.maxSecretHoldTime < 60) {
    throw new Error('MAX_SECRET_HOLD_TIME must be at least 60 seconds');
  }

  if (config.validationTolerance < 0 || config.validationTolerance > 1) {
    throw new Error('VALIDATION_TOLERANCE must be between 0 and 1');
  }

  if (config.pollInterval < 1000) {
    throw new Error('POLL_INTERVAL must be at least 1000ms');
  }

  if (config.userDeadlineBuffer < 300) {
    throw new Error('USER_DEADLINE_BUFFER must be at least 300 seconds');
  }

  if (config.cancelAfterBuffer < 600) {
    throw new Error('CANCEL_AFTER_BUFFER must be at least 600 seconds');
  }

  if (config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
}