/**
 * Cardano Resolver for 1inch Cross-Chain Swaps
 * Main entry point for the resolver service
 */

import dotenv from 'dotenv';
import { Command } from 'commander';
import chalk from 'chalk';
import { createLogger, format, transports } from 'winston';
import CardanoService from './cardano-service';
import { StateManager } from './state-manager';
import { MonitoringService } from './monitoring';

// Load environment variables
dotenv.config();

// Configure logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

// Configuration from environment
const config = {
  cardano: {
    network: (process.env.CARDANO_NETWORK || 'testnet') as 'mainnet' | 'testnet' | 'preprod',
    blockfrostApiKey: process.env.BLOCKFROST_API_KEY || '',
    plutusScriptPath: process.env.PLUTUS_SCRIPT_PATH || './contracts/escrow.plutus',
    resolverSeed: process.env.CARDANO_SEED_PHRASE || '',
    minConfirmations: parseInt(process.env.CARDANO_MIN_CONFIRMATIONS || '6'),
  },
  evm: {
    chainId: parseInt(process.env.EVM_CHAIN_ID || '1'),
    rpcUrl: process.env.EVM_RPC_URL || '',
    resolverAddress: process.env.RESOLVER_CONTRACT_ADDRESS || '',
    escrowFactoryAddress: process.env.ESCROW_FACTORY_ADDRESS || '',
    resolverPrivateKey: process.env.RESOLVER_PRIVATE_KEY || '',
  },
  monitoring: {
    port: parseInt(process.env.MONITORING_PORT || '3000'),
    enabled: process.env.MONITORING_ENABLED === 'true',
  }
};

class CardanoResolverApp {
  private cardanoService: CardanoService;
  private stateManager: StateManager;
  private monitoringService: MonitoringService;
  private isRunning = false;

  constructor() {
    this.cardanoService = new CardanoService(config.cardano, config.evm);
    this.stateManager = new StateManager();
    this.monitoringService = new MonitoringService(config.monitoring);

    this.setupEventHandlers();
  }

  /**
   * Start the resolver service
   */
  async start(): Promise<void> {
    try {
      logger.info(chalk.blue('🚀 Starting Cardano Resolver for 1inch Cross-Chain Swaps'));

      // Validate configuration
      this.validateConfiguration();

      // Start services
      await this.cardanoService.start();
      await this.stateManager.start();

      if (config.monitoring.enabled) {
        await this.monitoringService.start();
      }

      this.isRunning = true;
      logger.info(chalk.green('✅ Cardano Resolver started successfully'));

      // Log service status
      this.logStatus();

    } catch (error) {
      logger.error(chalk.red('❌ Failed to start Cardano Resolver:'), error);
      throw error;
    }
  }

  /**
   * Stop the resolver service gracefully
   */
  async stop(): Promise<void> {
    try {
      logger.info(chalk.yellow('🛑 Stopping Cardano Resolver...'));

      this.isRunning = false;

      // Stop services in reverse order
      if (config.monitoring.enabled) {
        await this.monitoringService.stop();
      }

      await this.stateManager.stop();
      await this.cardanoService.stop();

      logger.info(chalk.green('✅ Cardano Resolver stopped gracefully'));

    } catch (error) {
      logger.error(chalk.red('❌ Error stopping Cardano Resolver:'), error);
      throw error;
    }
  }

  /**
   * Setup event handlers for service coordination
   */
  private setupEventHandlers(): void {
    // Cardano service events
    this.cardanoService.on('escrowDeployed', (data) => {
      logger.info(`🏗️ Cardano escrow deployed: ${data.orderHash}`);
      this.stateManager.updateOrderStatus(data.orderHash, 'cardano_deployed');
    });

    this.cardanoService.on('withdrawalCompleted', (data) => {
      logger.info(`💰 Cardano withdrawal completed: ${data.orderHash}`);
      this.stateManager.updateOrderStatus(data.orderHash, 'completed');
    });

    this.cardanoService.on('cancellationCompleted', (data) => {
      logger.info(`🚫 Cardano cancellation completed: ${data.orderHash}`);
      this.stateManager.updateOrderStatus(data.orderHash, 'cancelled');
    });

    this.cardanoService.on('error', (data) => {
      logger.error(`❌ Cardano service error for ${data.orderHash}:`, data.error);
      this.stateManager.updateOrderStatus(data.orderHash, 'error');
    });

    // State manager events
    this.stateManager.on('orderStatusChanged', (data) => {
      logger.info(`📊 Order status changed: ${data.orderHash} -> ${data.status}`);
    });

    this.stateManager.on('timelockExpired', (data) => {
      logger.warn(`⏰ Timelock expired for order: ${data.orderHash}`);
    });

    // Health check events
    this.cardanoService.on('healthCheck', (data) => {
      if (config.monitoring.enabled) {
        this.monitoringService.updateHealthMetrics(data);
      }
    });

    // Process termination handlers
    process.on('SIGINT', this.handleShutdown.bind(this));
    process.on('SIGTERM', this.handleShutdown.bind(this));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.handleShutdown();
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.handleShutdown();
    });
  }

  /**
   * Validate configuration before starting
   */
  private validateConfiguration(): void {
    const required = [
      'BLOCKFROST_API_KEY',
      'CARDANO_SEED_PHRASE',
      'EVM_RPC_URL',
      'RESOLVER_CONTRACT_ADDRESS',
      'RESOLVER_PRIVATE_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.info('✅ Configuration validated');
  }

  /**
   * Log current service status
   */
  private logStatus(): void {
    logger.info(chalk.cyan('📊 Service Status:'));
    logger.info(`   • Cardano Network: ${config.cardano.network}`);
    logger.info(`   • EVM Chain ID: ${config.evm.chainId}`);
    logger.info(`   • Resolver Address: ${config.evm.resolverAddress}`);
    logger.info(`   • Monitoring: ${config.monitoring.enabled ? 'Enabled' : 'Disabled'}`);

    if (config.monitoring.enabled) {
      logger.info(`   • Monitoring Port: ${config.monitoring.port}`);
    }
  }

  /**
   * Handle graceful shutdown
   */
  private async handleShutdown(): Promise<void> {
    if (this.isRunning) {
      await this.stop();
    }
    process.exit(0);
  }
}

// CLI Commands
const program = new Command();

program
  .name('cardano-resolver')
  .description('Cardano Resolver for 1inch Cross-Chain Swaps')
  .version('1.0.0');

program
  .command('start')
  .description('Start the resolver service')
  .action(async () => {
    const app = new CardanoResolverApp();
    await app.start();
  });

program
  .command('monitor')
  .description('Monitor resolver activity')
  .option('--chain <chain>', 'Source chain to monitor', 'ethereum')
  .option('--destination <destination>', 'Destination chain', 'cardano')
  .action(async (options) => {
    logger.info(`👁️ Monitoring ${options.chain} → ${options.destination} swaps...`);
    // Implementation for monitoring mode
  });

program
  .command('resolve')
  .description('Manually resolve a specific order')
  .requiredOption('--order-hash <hash>', 'Order hash to resolve')
  .option('--src-chain <chain>', 'Source chain', 'ethereum')
  .option('--dst-chain <chain>', 'Destination chain', 'cardano')
  .action(async (options) => {
    logger.info(`🔧 Manually resolving order: ${options.orderHash}`);
    // Implementation for manual resolution
  });

program
  .command('status')
  .description('Check resolver status')
  .action(async () => {
    // Implementation for status check
    logger.info('📊 Resolver Status: Running');
  });

// Main execution
if (require.main === module) {
  program.parse();
}

export { CardanoResolverApp, config };
export default CardanoResolverApp;