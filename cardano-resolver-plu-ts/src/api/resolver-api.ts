import express from 'express';
import { CardanoResolver } from '../resolvers/cardano-resolver';
import { ResolverConfig } from '../types/resolver-types';

/**
 * REST API for Cardano Resolver (similar to the gist structure)
 */
export class ResolverAPI {
  private app: express.Application;
  private resolver: CardanoResolver;
  private config: ResolverConfig;

  constructor(resolver: CardanoResolver, config: ResolverConfig) {
    this.app = express();
    this.resolver = resolver;
    this.config = config;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        network: this.config.cardanoNetwork
      });
    });

    // Create new cross-chain order
    this.app.post('/api/v1/order/new', async (req, res) => {
      try {
        const {
          makerAsset,
          takerAsset,
          srcChainId,
          deadline,
          allowPartialFills,
          allowMultipleFills,
          auction,
          whitelist
        } = req.body;

        const order = await this.resolver.newCardanoOrder({
          makerAsset,
          takerAsset,
          srcChainId,
          deadline,
          allowPartialFills,
          allowMultipleFills,
          auction,
          whitelist
        });

        res.json({
          success: true,
          order,
          secret: this.resolver.getSecret(order.orderHash)?.secret
        });

      } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Deploy destination escrow
    this.app.post('/api/v1/escrow/deploy', async (req, res) => {
      try {
        const {
          maker,
          resolver,
          beneficiary,
          asset,
          amount,
          hashlock,
          userDeadline,
          cancelAfter,
          depositLovelace,
          orderHash,
          fillId,
          merkleRoot
        } = req.body;

        const result = await this.resolver.deployDst({
          maker,
          resolver,
          beneficiary,
          asset,
          amount: BigInt(amount),
          hashlock,
          userDeadline,
          cancelAfter,
          depositLovelace: BigInt(depositLovelace),
          orderHash,
          fillId,
          merkleRoot
        });

        res.json(result);

      } catch (error) {
        console.error('Error deploying escrow:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Withdraw from escrow
    this.app.post('/api/v1/escrow/withdraw', async (req, res) => {
      try {
        const { orderHash, secret, beneficiaryAddress } = req.body;

        const result = await this.resolver.withdraw({
          orderHash,
          secret,
          beneficiaryAddress
        });

        res.json(result);

      } catch (error) {
        console.error('Error withdrawing:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Cancel escrow
    this.app.post('/api/v1/escrow/cancel', async (req, res) => {
      try {
        const { orderHash, resolverAddress } = req.body;

        const result = await this.resolver.cancel({
          orderHash,
          resolverAddress
        });

        res.json(result);

      } catch (error) {
        console.error('Error cancelling:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get order status
    this.app.get('/api/v1/order/:orderHash/status', (req, res) => {
      try {
        const { orderHash } = req.params;
        const status = this.resolver.getOrderStatus(orderHash);

        if (!status) {
          return res.status(404).json({
            success: false,
            error: 'Order not found'
          });
        }

        res.json({
          success: true,
          status
        });

      } catch (error) {
        console.error('Error getting order status:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get all active orders
    this.app.get('/api/v1/orders/active', (req, res) => {
      try {
        const orders = this.resolver.getActiveOrders();
        res.json({
          success: true,
          orders
        });

      } catch (error) {
        console.error('Error getting active orders:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get order secret
    this.app.get('/api/v1/order/:orderHash/secret', (req, res) => {
      try {
        const { orderHash } = req.params;
        const secretInfo = this.resolver.getSecret(orderHash);

        if (!secretInfo) {
          return res.status(404).json({
            success: false,
            error: 'Secret not found'
          });
        }

        res.json({
          success: true,
          secret: secretInfo
        });

      } catch (error) {
        console.error('Error getting secret:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Calculate order profitability
    this.app.post('/api/v1/order/profit', async (req, res) => {
      try {
        const order = req.body;
        const profit = await this.resolver.calculateProfit(order);

        res.json({
          success: true,
          profit
        });

      } catch (error) {
        console.error('Error calculating profit:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get escrow UTXOs for an order
    this.app.get('/api/v1/order/:orderHash/utxos', async (req, res) => {
      try {
        const { orderHash } = req.params;
        const utxos = await this.resolver.getEscrowUtxos(orderHash);

        res.json({
          success: true,
          utxos
        });

      } catch (error) {
        console.error('Error getting UTXOs:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Webhook endpoint for cross-chain events
    this.app.post('/api/v1/webhook/cross-chain', (req, res) => {
      try {
        const event = req.body;
        console.log('📡 Received cross-chain event:', event);

        // Handle different event types
        switch (event.type) {
          case 'src_filled':
            this.resolver.emit('srcFilled', event);
            break;
          case 'secret_revealed':
            this.resolver.emit('secretRevealed', event);
            break;
          case 'order_cancelled':
            this.resolver.emit('orderCancelled', event);
            break;
          default:
            console.log('Unknown event type:', event.type);
        }

        res.json({ success: true });

      } catch (error) {
        console.error('Error handling webhook:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('API Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.apiPort, () => {
        console.log(`🌐 Resolver API listening on port ${this.config.apiPort}`);
        console.log(`📍 Health check: http://localhost:${this.config.apiPort}/health`);
        resolve();
      });
    });
  }

  /**
   * Get Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }
}