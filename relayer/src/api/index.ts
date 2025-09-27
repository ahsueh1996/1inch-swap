import express from 'express';
import { SwapRegistry } from '../database';
import { SecretMediator } from '../services/mediator';
import { LivenessEnforcer } from '../services/enforcer';
import { TimeoutMonitor } from '../services/monitor';
import { ChainMonitorService } from '../services/chainMonitor';
import { ParameterValidator } from '../services/validator';
import { RelayerConfig, SwapParams } from '../types';

export function createAPI(
  registry: SwapRegistry,
  mediator: SecretMediator,
  enforcer: LivenessEnforcer,
  monitor: TimeoutMonitor,
  chainMonitor: ChainMonitorService,
  validator: ParameterValidator,
  config: RelayerConfig
): express.Application {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${config.apiSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  app.post('/swaps', async (req, res) => {
    try {
      const params: SwapParams = req.body;

      const validation = validator.validateSwapParams(params);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid swap parameters',
          details: validation.errors
        });
      }

      const swap = await registry.createSwap(params);
      await mediator.requestSecret(swap.orderId);

      res.status(201).json({
        success: true,
        swap: {
          id: swap.id,
          orderId: swap.orderId,
          status: swap.status
        }
      });

    } catch (error) {
      console.error('Error creating swap:', error);
      res.status(500).json({
        error: 'Failed to create swap',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/swaps/:orderId/secret', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { secret } = req.body;

      if (!secret) {
        return res.status(400).json({ error: 'Secret is required' });
      }

      await mediator.provideSecret(orderId, secret);

      res.json({
        success: true,
        message: 'Secret received and validated'
      });

    } catch (error) {
      console.error('Error providing secret:', error);
      res.status(400).json({
        error: 'Failed to provide secret',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/swaps/:orderId/resolver-ready', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { resolverAddress } = req.body;

      if (!resolverAddress) {
        return res.status(400).json({ error: 'Resolver address is required' });
      }

      await mediator.handleResolverReady(orderId, resolverAddress);

      res.json({
        success: true,
        message: 'Resolver readiness processed'
      });

    } catch (error) {
      console.error('Error handling resolver ready:', error);
      res.status(400).json({
        error: 'Failed to handle resolver ready',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/swaps/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const swap = await registry.getSwap(orderId);

      if (!swap) {
        return res.status(404).json({ error: 'Swap not found' });
      }

      res.json({
        success: true,
        swap: {
          id: swap.id,
          orderId: swap.orderId,
          status: swap.status,
          params: swap.params,
          secretSharedAt: swap.secretSharedAt,
          createdAt: swap.createdAt,
          updatedAt: swap.updatedAt
        }
      });

    } catch (error) {
      console.error('Error fetching swap:', error);
      res.status(500).json({
        error: 'Failed to fetch swap',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/swaps', async (req, res) => {
    try {
      const { status } = req.query;
      let swaps;

      if (status === 'active') {
        swaps = await registry.getActiveSwaps();
      } else {
        swaps = await registry.getActiveSwaps();
      }

      res.json({
        success: true,
        swaps: swaps.map(swap => ({
          id: swap.id,
          orderId: swap.orderId,
          status: swap.status,
          params: {
            srcToken: swap.params.srcToken,
            dstToken: swap.params.dstToken,
            srcAmount: swap.params.srcAmount,
            dstAmount: swap.params.dstAmount,
            userDeadline: swap.params.userDeadline,
            cancelAfter: swap.params.cancelAfter
          },
          createdAt: swap.createdAt
        }))
      });

    } catch (error) {
      console.error('Error fetching swaps:', error);
      res.status(500).json({
        error: 'Failed to fetch swaps',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/swaps/:orderId/force-reveal', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;

      const result = await enforcer.forcePublishSecret(
        orderId,
        reason || 'manual_force_reveal'
      );

      res.json({
        success: true,
        result
      });

    } catch (error) {
      console.error('Error force revealing secret:', error);
      res.status(400).json({
        error: 'Failed to force reveal secret',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/status', async (req, res) => {
    try {
      const chainStatus = await chainMonitor.getChainStatus();
      const upcomingDeadlines = await monitor.getUpcomingDeadlines(3600);
      const activeSwaps = await registry.getActiveSwaps();

      res.json({
        success: true,
        status: {
          relayer: 'running',
          chains: chainStatus,
          activeSwaps: activeSwaps.length,
          upcomingDeadlines: upcomingDeadlines.length,
          config: {
            maxSecretHoldTime: config.maxSecretHoldTime,
            validationTolerance: config.validationTolerance,
            pollInterval: config.pollInterval
          }
        }
      });

    } catch (error) {
      console.error('Error fetching status:', error);
      res.status(500).json({
        error: 'Failed to fetch status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/deadlines', async (req, res) => {
    try {
      const windowSeconds = parseInt(req.query.window as string) || 3600;
      const deadlines = await monitor.getUpcomingDeadlines(windowSeconds);

      res.json({
        success: true,
        deadlines
      });

    } catch (error) {
      console.error('Error fetching deadlines:', error);
      res.status(500).json({
        error: 'Failed to fetch deadlines',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  });

  return app;
}