import * as sqlite3 from 'sqlite3';
import { Database as SqliteDB, open } from 'sqlite';
import { SwapState, FusionOrder } from './resolver';

interface DatabaseSchema {
  swaps: {
    orderHash: string;
    orderData: string; // JSON serialized FusionOrder
    status: string;
    evmTx?: string;
    cardanoTx?: string;
    secret?: string;
    createdAt: string;
    updatedAt: string;
  };

  refunds: {
    id: number;
    orderHash: string;
    status: string;
    reason: string;
    evmRefundTx?: string;
    cardanoRefundTx?: string;
    initiatedAt: string;
    completedAt?: string;
    error?: string;
  };

  secrets: {
    orderHash: string;
    secret: string;
    secretHash: string;
    revealed: boolean;
    revealedOn?: string;
    revealTx?: string;
    createdAt: string;
  };

  events: {
    id: number;
    orderHash: string;
    eventType: string;
    eventData: string; // JSON serialized event data
    timestamp: string;
  };
}

export class Database {
  private db: SqliteDB | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    try {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      await this.createTables();
      await this.createIndexes();

      console.log(`📁 Database initialized at ${this.dbPath}`);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Swaps table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS swaps (
        orderHash TEXT PRIMARY KEY,
        orderData TEXT NOT NULL,
        status TEXT NOT NULL,
        evmTx TEXT,
        cardanoTx TEXT,
        secret TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    // Refunds table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS refunds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderHash TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        evmRefundTx TEXT,
        cardanoRefundTx TEXT,
        initiatedAt TEXT NOT NULL,
        completedAt TEXT,
        error TEXT,
        FOREIGN KEY (orderHash) REFERENCES swaps(orderHash)
      )
    `);

    // Secrets table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        orderHash TEXT PRIMARY KEY,
        secret TEXT NOT NULL,
        secretHash TEXT NOT NULL,
        revealed BOOLEAN NOT NULL DEFAULT 0,
        revealedOn TEXT,
        revealTx TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (orderHash) REFERENCES swaps(orderHash)
      )
    `);

    // Events table for audit trail
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderHash TEXT NOT NULL,
        eventType TEXT NOT NULL,
        eventData TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_swaps_status ON swaps(status);
      CREATE INDEX IF NOT EXISTS idx_swaps_created_at ON swaps(createdAt);
      CREATE INDEX IF NOT EXISTS idx_refunds_order_hash ON refunds(orderHash);
      CREATE INDEX IF NOT EXISTS idx_events_order_hash ON events(orderHash);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    `);
  }

  async saveSwap(orderHash: string, swapState: SwapState): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        INSERT OR REPLACE INTO swaps (
          orderHash, orderData, status, evmTx, cardanoTx, secret, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        orderHash,
        JSON.stringify(swapState.order),
        swapState.status,
        swapState.evmTx || null,
        swapState.cardanoTx || null,
        swapState.secret || null,
        swapState.createdAt.toISOString(),
        swapState.updatedAt.toISOString()
      ]);

      await this.logEvent(orderHash, 'swap_saved', { status: swapState.status });

    } catch (error) {
      console.error(`Failed to save swap ${orderHash}:`, error);
      throw error;
    }
  }

  async updateSwap(orderHash: string, updates: Partial<SwapState>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const currentSwap = await this.getSwap(orderHash);
      if (!currentSwap) {
        throw new Error(`Swap ${orderHash} not found`);
      }

      const updatedSwap = { ...currentSwap, ...updates, updatedAt: new Date() };

      await this.db.run(`
        UPDATE swaps SET
          orderData = ?, status = ?, evmTx = ?, cardanoTx = ?, secret = ?, updatedAt = ?
        WHERE orderHash = ?
      `, [
        JSON.stringify(updatedSwap.order),
        updatedSwap.status,
        updatedSwap.evmTx || null,
        updatedSwap.cardanoTx || null,
        updatedSwap.secret || null,
        updatedSwap.updatedAt.toISOString(),
        orderHash
      ]);

      await this.logEvent(orderHash, 'swap_updated', updates);

    } catch (error) {
      console.error(`Failed to update swap ${orderHash}:`, error);
      throw error;
    }
  }

  async getSwap(orderHash: string): Promise<SwapState | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const row = await this.db.get(`
        SELECT * FROM swaps WHERE orderHash = ?
      `, [orderHash]);

      if (!row) return null;

      return {
        order: JSON.parse(row.orderData) as FusionOrder,
        status: row.status as SwapState['status'],
        evmTx: row.evmTx || undefined,
        cardanoTx: row.cardanoTx || undefined,
        secret: row.secret || undefined,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      };

    } catch (error) {
      console.error(`Failed to get swap ${orderHash}:`, error);
      throw error;
    }
  }

  async getActiveSwaps(): Promise<SwapState[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const rows = await this.db.all(`
        SELECT * FROM swaps
        WHERE status NOT IN ('completed', 'cancelled')
        ORDER BY createdAt DESC
      `);

      return rows.map(row => ({
        order: JSON.parse(row.orderData) as FusionOrder,
        status: row.status as SwapState['status'],
        evmTx: row.evmTx || undefined,
        cardanoTx: row.cardanoTx || undefined,
        secret: row.secret || undefined,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      }));

    } catch (error) {
      console.error('Failed to get active swaps:', error);
      throw error;
    }
  }

  async saveRefund(refund: {
    orderHash: string;
    status: string;
    reason: string;
    evmRefundTx?: string;
    cardanoRefundTx?: string;
    initiatedAt: Date;
    completedAt?: Date;
    error?: string;
  }): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.run(`
        INSERT INTO refunds (
          orderHash, status, reason, evmRefundTx, cardanoRefundTx,
          initiatedAt, completedAt, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        refund.orderHash,
        refund.status,
        refund.reason,
        refund.evmRefundTx || null,
        refund.cardanoRefundTx || null,
        refund.initiatedAt.toISOString(),
        refund.completedAt?.toISOString() || null,
        refund.error || null
      ]);

      await this.logEvent(refund.orderHash, 'refund_initiated', refund);

      return result.lastID!;

    } catch (error) {
      console.error(`Failed to save refund for ${refund.orderHash}:`, error);
      throw error;
    }
  }

  async saveSecret(orderHash: string, secret: string, secretHash: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        INSERT OR REPLACE INTO secrets (
          orderHash, secret, secretHash, revealed, createdAt
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        orderHash,
        secret,
        secretHash,
        false,
        new Date().toISOString()
      ]);

      await this.logEvent(orderHash, 'secret_stored', { secretHash });

    } catch (error) {
      console.error(`Failed to save secret for ${orderHash}:`, error);
      throw error;
    }
  }

  async updateSecretRevealed(orderHash: string, revealedOn: string, revealTx: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        UPDATE secrets SET revealed = ?, revealedOn = ?, revealTx = ?
        WHERE orderHash = ?
      `, [true, revealedOn, revealTx, orderHash]);

      await this.logEvent(orderHash, 'secret_revealed', { revealedOn, revealTx });

    } catch (error) {
      console.error(`Failed to update secret reveal for ${orderHash}:`, error);
      throw error;
    }
  }

  async logEvent(orderHash: string, eventType: string, eventData: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        INSERT INTO events (orderHash, eventType, eventData, timestamp)
        VALUES (?, ?, ?, ?)
      `, [
        orderHash,
        eventType,
        JSON.stringify(eventData),
        new Date().toISOString()
      ]);

    } catch (error) {
      console.error(`Failed to log event ${eventType} for ${orderHash}:`, error);
      // Don't throw - logging failures shouldn't break main functionality
    }
  }

  async getSwapHistory(orderHash: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const events = await this.db.all(`
        SELECT * FROM events
        WHERE orderHash = ?
        ORDER BY timestamp ASC
      `, [orderHash]);

      return events.map(event => ({
        ...event,
        eventData: JSON.parse(event.eventData),
        timestamp: new Date(event.timestamp)
      }));

    } catch (error) {
      console.error(`Failed to get history for ${orderHash}:`, error);
      throw error;
    }
  }

  async getStats(): Promise<{
    totalSwaps: number;
    activeSwaps: number;
    completedSwaps: number;
    totalRefunds: number;
    pendingRefunds: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const [swapStats, refundStats] = await Promise.all([
        this.db.get(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
          FROM swaps
        `),
        this.db.get(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status NOT IN ('completed', 'failed') THEN 1 ELSE 0 END) as pending
          FROM refunds
        `)
      ]);

      return {
        totalSwaps: swapStats.total,
        activeSwaps: swapStats.active,
        completedSwaps: swapStats.completed,
        totalRefunds: refundStats.total,
        pendingRefunds: refundStats.pending
      };

    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (!this.db) return;

    try {
      // Clean up old completed swaps (older than 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      await this.db.run(`
        DELETE FROM events
        WHERE timestamp < ? AND orderHash IN (
          SELECT orderHash FROM swaps WHERE status = 'completed' AND updatedAt < ?
        )
      `, [thirtyDaysAgo, thirtyDaysAgo]);

      await this.db.run(`
        DELETE FROM secrets
        WHERE orderHash IN (
          SELECT orderHash FROM swaps WHERE status = 'completed' AND updatedAt < ?
        )
      `, [thirtyDaysAgo]);

      await this.db.run(`
        DELETE FROM refunds
        WHERE completedAt < ?
      `, [thirtyDaysAgo]);

      await this.db.run(`
        DELETE FROM swaps
        WHERE status = 'completed' AND updatedAt < ?
      `, [thirtyDaysAgo]);

      console.log('🧹 Database cleanup completed');

    } catch (error) {
      console.error('Failed to cleanup database:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log('📁 Database connection closed');
    }
  }
}