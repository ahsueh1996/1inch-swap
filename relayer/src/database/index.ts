import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { SwapRecord, SwapParams, SwapStatusType } from '../types';

export class SwapRegistry {
  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

  async initialize(dbPath: string): Promise<void> {
    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    await this.createTables();
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS swaps (
        id TEXT PRIMARY KEY,
        order_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        maker_address TEXT NOT NULL,
        taker_address TEXT NOT NULL,
        src_token TEXT NOT NULL,
        dst_token TEXT NOT NULL,
        src_amount TEXT NOT NULL,
        dst_amount TEXT NOT NULL,
        hashlock TEXT NOT NULL,
        user_deadline INTEGER NOT NULL,
        cancel_after INTEGER NOT NULL,
        chain_id_src INTEGER NOT NULL,
        chain_id_dst INTEGER NOT NULL,
        escrow_address_src TEXT,
        escrow_address_dst TEXT,
        secret TEXT,
        secret_shared_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_order_id ON swaps(order_id);
      CREATE INDEX IF NOT EXISTS idx_status ON swaps(status);
      CREATE INDEX IF NOT EXISTS idx_user_deadline ON swaps(user_deadline);
      CREATE INDEX IF NOT EXISTS idx_cancel_after ON swaps(cancel_after);
    `);
  }

  async createSwap(params: SwapParams): Promise<SwapRecord> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const record: SwapRecord = {
      id,
      orderId: params.orderId,
      status: 'pending',
      params,
      createdAt: now,
      updatedAt: now
    };

    await this.db.run(`
      INSERT INTO swaps (
        id, order_id, status, maker_address, taker_address,
        src_token, dst_token, src_amount, dst_amount, hashlock,
        user_deadline, cancel_after, chain_id_src, chain_id_dst,
        escrow_address_src, escrow_address_dst, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, params.orderId, record.status, params.makerAddress, params.takerAddress,
      params.srcToken, params.dstToken, params.srcAmount, params.dstAmount, params.hashlock,
      params.userDeadline, params.cancelAfter, params.chainIdSrc, params.chainIdDst,
      params.escrowAddressSrc, params.escrowAddressDst, now, now
    ]);

    return record;
  }

  async updateSwapStatus(orderId: string, status: SwapStatusType): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.run(
      'UPDATE swaps SET status = ?, updated_at = ? WHERE order_id = ?',
      [status, Date.now(), orderId]
    );
  }

  async setSecret(orderId: string, secret: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.run(
      'UPDATE swaps SET secret = ?, secret_shared_at = ?, status = ?, updated_at = ? WHERE order_id = ?',
      [secret, Date.now(), 'secret_shared', Date.now(), orderId]
    );
  }

  async getSwap(orderId: string): Promise<SwapRecord | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.get(`
      SELECT * FROM swaps WHERE order_id = ?
    `, [orderId]);

    if (!row) return null;

    return this.rowToRecord(row);
  }

  async getActiveSwaps(): Promise<SwapRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all(`
      SELECT * FROM swaps
      WHERE status IN ('pending', 'awaiting_secret', 'secret_shared')
      ORDER BY created_at ASC
    `);

    return rows.map(this.rowToRecord);
  }

  async getSwapsNeedingSecretReveal(): Promise<SwapRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all(`
      SELECT * FROM swaps
      WHERE status = 'awaiting_secret'
      ORDER BY created_at ASC
    `);

    return rows.map(this.rowToRecord);
  }

  async getSwapsWithExpiredGrace(maxSecretHoldTime: number): Promise<SwapRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const expiredBefore = Date.now() - (maxSecretHoldTime * 1000);

    const rows = await this.db.all(`
      SELECT * FROM swaps
      WHERE status = 'secret_shared'
      AND secret_shared_at < ?
      ORDER BY secret_shared_at ASC
    `, [expiredBefore]);

    return rows.map(this.rowToRecord);
  }

  async getSwapsPastUserDeadline(): Promise<SwapRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const now = Math.floor(Date.now() / 1000);

    const rows = await this.db.all(`
      SELECT * FROM swaps
      WHERE status IN ('pending', 'awaiting_secret', 'secret_shared')
      AND user_deadline < ?
      ORDER BY user_deadline ASC
    `, [now]);

    return rows.map(this.rowToRecord);
  }

  async getSwapsPastCancelDeadline(): Promise<SwapRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const now = Math.floor(Date.now() / 1000);

    const rows = await this.db.all(`
      SELECT * FROM swaps
      WHERE status IN ('pending', 'awaiting_secret', 'secret_shared')
      AND cancel_after < ?
      ORDER BY cancel_after ASC
    `, [now]);

    return rows.map(this.rowToRecord);
  }

  private rowToRecord(row: any): SwapRecord {
    return {
      id: row.id,
      orderId: row.order_id,
      status: row.status,
      params: {
        orderId: row.order_id,
        makerAddress: row.maker_address,
        takerAddress: row.taker_address,
        srcToken: row.src_token,
        dstToken: row.dst_token,
        srcAmount: row.src_amount,
        dstAmount: row.dst_amount,
        hashlock: row.hashlock,
        userDeadline: row.user_deadline,
        cancelAfter: row.cancel_after,
        chainIdSrc: row.chain_id_src,
        chainIdDst: row.chain_id_dst,
        escrowAddressSrc: row.escrow_address_src,
        escrowAddressDst: row.escrow_address_dst
      },
      secret: row.secret,
      secretSharedAt: row.secret_shared_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}