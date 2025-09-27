import { SwapRegistry } from './database';
import { SecretMediator } from './services/mediator';
import { LivenessEnforcer } from './services/enforcer';
import { TimeoutMonitor } from './services/monitor';
import { ChainMonitorService } from './services/chainMonitor';
import { ParameterValidator } from './services/validator';
import { createAPI } from './api';
import { loadConfig } from './utils/config';

export class CardanoRelayer {
  private registry!: SwapRegistry;
  private mediator!: SecretMediator;
  private enforcer!: LivenessEnforcer;
  private monitor!: TimeoutMonitor;
  private chainMonitor!: ChainMonitorService;
  private validator!: ParameterValidator;
  private config = loadConfig();
  private server: any = null;

  async initialize(): Promise<void> {
    console.log('Initializing CardanoSwap+ Relayer...');

    this.registry = new SwapRegistry();
    await this.registry.initialize(this.config.dbPath);

    this.validator = new ParameterValidator(this.config);

    this.mediator = new SecretMediator(
      this.registry,
      this.validator,
      this.config
    );

    this.enforcer = new LivenessEnforcer(
      this.registry,
      this.config
    );

    this.monitor = new TimeoutMonitor(
      this.registry,
      this.config
    );

    this.chainMonitor = new ChainMonitorService(
      this.registry,
      this.config
    );

    await this.chainMonitor.initialize();

    this.setupEventHandlers();

    console.log('Relayer initialization complete');
  }

  private setupEventHandlers(): void {
    this.mediator.on('secretRequested', (request) => {
      console.log(`🔑 Secret requested for order ${request.orderId}`);
    });

    this.mediator.on('secretReceived', (response) => {
      console.log(`✅ Secret received for order ${response.orderId}`);
    });

    this.mediator.on('secretShared', (event) => {
      console.log(`🔄 Secret shared with resolver for order ${event.orderId}`);
    });

    this.mediator.on('secretForceRevealed', (event) => {
      console.log(`⚠️  Secret force revealed for order ${event.orderId}: ${event.reason}`);
    });

    this.enforcer.on('secretPublishedPublicly', (reveal) => {
      console.log(`📢 Secret published publicly for order ${reveal.orderId}`);
      if (reveal.ipfsHash) {
        console.log(`  IPFS: ${reveal.ipfsHash}`);
      }
    });

    this.monitor.on('timeoutAlert', (alert) => {
      console.log(`⏰ Timeout alert: ${alert.alertType} for ${alert.orderId} in ${alert.timeRemaining}s`);
    });

    this.monitor.on('swapExpired', (event) => {
      console.log(`❌ Swap expired: ${event.orderId} (${event.reason})`);
    });

    this.monitor.on('secretRevealRequired', (event) => {
      console.log(`🚨 Secret reveal required for ${event.orderId}: ${event.reason}`);
      if (event.urgency === 'high') {
        this.enforcer.forcePublishSecret(event.orderId, event.reason)
          .catch(error => console.error(`Failed to force publish secret:`, error));
      }
    });

    this.chainMonitor.on('escrowEvent', (event) => {
      console.log(`⛓️  Chain event: ${event.type} for ${event.orderId} on tx ${event.transactionHash}`);
    });

    this.chainMonitor.on('secretRevealed', async (event) => {
      console.log(`🔓 Secret revealed on-chain for ${event.orderId}: ${event.secret}`);
      try {
        await this.registry.updateSwapStatus(event.orderId, 'completed');
      } catch (error) {
        console.error(`Failed to update swap status:`, error);
      }
    });

    this.mediator.on('secretReadyForResolver', async (event) => {
      console.log(`🎯 Secret ready for resolver: ${event.orderId}`);
    });

    this.monitor.on('publicCancelRequired', (event) => {
      console.log(`🚫 Public cancel required for ${event.orderId}`);
    });
  }

  async start(): Promise<void> {
    console.log('Starting relayer services...');

    this.enforcer.start();
    this.monitor.start();
    this.chainMonitor.start();

    const app = createAPI(
      this.registry,
      this.mediator,
      this.enforcer,
      this.monitor,
      this.chainMonitor,
      this.validator,
      this.config
    );

    this.server = app.listen(this.config.port, () => {
      console.log(`🚀 Relayer API listening on port ${this.config.port}`);
      console.log(`📊 Status endpoint: http://localhost:${this.config.port}/status`);
    });

    setInterval(async () => {
      try {
        await this.mediator.processSecretQueue();
      } catch (error) {
        console.error('Error processing secret queue:', error);
      }
    }, 5000);

    console.log('✅ CardanoSwap+ Relayer is running');
  }

  async stop(): Promise<void> {
    console.log('Stopping relayer services...');

    if (this.server) {
      this.server.close();
    }

    await Promise.all([
      this.enforcer?.cleanup(),
      this.monitor?.cleanup(),
      this.chainMonitor?.cleanup(),
      this.mediator?.cleanup(),
      this.registry?.close()
    ]);

    console.log('✅ Relayer stopped');
  }

  async getStatus(): Promise<any> {
    const chainStatus = await this.chainMonitor.getChainStatus();
    const upcomingDeadlines = await this.monitor.getUpcomingDeadlines(3600);
    const activeSwaps = await this.registry.getActiveSwaps();

    return {
      relayer: 'running',
      chains: chainStatus,
      activeSwaps: activeSwaps.length,
      upcomingDeadlines: upcomingDeadlines.length,
      config: {
        maxSecretHoldTime: this.config.maxSecretHoldTime,
        validationTolerance: this.config.validationTolerance,
        pollInterval: this.config.pollInterval
      }
    };
  }
}

async function main(): Promise<void> {
  const relayer = new CardanoRelayer();

  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await relayer.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await relayer.stop();
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught exception:', error);
    await relayer.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
    await relayer.stop();
    process.exit(1);
  });

  try {
    await relayer.initialize();
    await relayer.start();
  } catch (error) {
    console.error('❌ Failed to start relayer:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export default CardanoRelayer;