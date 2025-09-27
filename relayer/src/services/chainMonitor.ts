import { ethers } from 'ethers';
import { Lucid, Blockfrost, fromHex, toHex } from 'lucid-cardano';
//import { loadLucid } from "../utils/lucidLoader";
import { SwapRegistry } from '../database';
import { RelayerConfig, SecretRevealEvent, ChainMonitor } from '../types';
import { EventEmitter } from 'events';

export interface EscrowEvent {
  type: 'EscrowCreated' | 'SecretRevealed' | 'Withdrawn' | 'Cancelled';
  orderId: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  data: any;
}

export class ChainMonitorService extends EventEmitter {
  private ethProvider: ethers.JsonRpcProvider | null = null;
  private lucid: any | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private chainStates = new Map<number, ChainMonitor>();

  constructor(
    private registry: SwapRegistry,
    private config: RelayerConfig
  ) {
    super();
  }

  async initialize(): Promise<void> {
    await this.initializeEthProvider();
    await this.initializeCardanoProvider();
    this.initializeChainStates();

    console.log('Chain monitor service initialized');
  }

  private async initializeEthProvider(): Promise<void> {
    this.ethProvider = new ethers.JsonRpcProvider(this.config.ethRpcUrl);

    try {
      const network = await this.ethProvider.getNetwork();
      console.log(`Connected to Ethereum network: ${network.name} (${network.chainId})`);
    } catch (error) {
      console.error('Failed to connect to Ethereum:', error);
      throw error;
    }
  }

  private async initializeCardanoProvider(): Promise<void> {
    try {
      this.lucid = await Lucid.new(
        new Blockfrost(
          this.config.cardanoNodeUrl,
          this.config.cardanoProjectId
        ),
        'Preprod' // 'Mainnet' or 'Preview' or 'Preprod' based on your network
      );

      console.log('Connected to Cardano network');
    } catch (error) {
      console.error('Failed to connect to Cardano:', error);
      throw error;
    }
  }

  private initializeChainStates(): void {
    this.chainStates.set(1, {
      chainId: 1,
      rpcUrl: this.config.ethRpcUrl,
      lastBlock: 0
    });

    this.chainStates.set(2147484648, {
      chainId: 2147484648,
      rpcUrl: this.config.cardanoNodeUrl,
      lastBlock: 0
    });
  }

  start(): void {
    if (this.monitoringInterval) {
      return;
    }

    console.log('Starting chain monitoring...');

    this.monitoringInterval = setInterval(
      () => this.monitorChains(),
      this.config.pollInterval
    );

    this.monitorChains();
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Chain monitoring stopped');
    }
  }

  private async monitorChains(): Promise<void> {
    try {
      await Promise.all([
        this.monitorEthereum(),
        this.monitorCardano()
      ]);
    } catch (error) {
      console.error('Error during chain monitoring:', error);
    }
  }

  private async monitorEthereum(): Promise<void> {
    if (!this.ethProvider) return;

    try {
      const currentBlock = await this.ethProvider.getBlockNumber();
      const chainState = this.chainStates.get(1);

      if (!chainState) return;

      const fromBlock = chainState.lastBlock || currentBlock - 10;
      const toBlock = currentBlock;

      if (fromBlock >= toBlock) return;

      await this.scanEthereumBlocks(fromBlock + 1, toBlock);

      chainState.lastBlock = currentBlock;
      this.chainStates.set(1, chainState);

    } catch (error) {
      console.error('Error monitoring Ethereum:', error);
    }
  }

  private async scanEthereumBlocks(fromBlock: number, toBlock: number): Promise<void> {
    if (!this.ethProvider) return;

    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
      try {
        const block = await this.ethProvider.getBlock(blockNumber, true);
        if (!block || !block.transactions) continue;

        for (const txHash of block.transactions) {
          await this.processTxHash(txHash as string, blockNumber);
        }
      } catch (error) {
        console.error(`Error scanning Ethereum block ${blockNumber}:`, error);
      }
    }
  }

  private async processTxHash(txHash: string, blockNumber: number): Promise<void> {
    if (!this.ethProvider) return;

    try {
      const receipt = await this.ethProvider.getTransactionReceipt(txHash);
      if (!receipt || !receipt.logs) return;

      for (const log of receipt.logs) {
        await this.processEthereumLog(log, blockNumber, txHash);
      }
    } catch (error) {
      console.error(`Error processing transaction ${txHash}:`, error);
    }
  }

  private async processEthereumLog(
    log: ethers.Log,
    blockNumber: number,
    txHash: string
  ): Promise<void> {
    try {
      const eventSig = log.topics[0];

      if (eventSig === ethers.id('SecretRevealed(bytes32,bytes32)')) {
        await this.handleSecretRevealedEvent(log, blockNumber, txHash);
      } else if (eventSig === ethers.id('EscrowCreated(bytes32,address,address,uint256)')) {
        await this.handleEscrowCreatedEvent(log, blockNumber, txHash);
      } else if (eventSig === ethers.id('Withdrawn(bytes32,address)')) {
        await this.handleWithdrawnEvent(log, blockNumber, txHash);
      }

    } catch (error) {
      console.error(`Error processing Ethereum log:`, error);
    }
  }

  private async handleSecretRevealedEvent(
    log: ethers.Log,
    blockNumber: number,
    txHash: string
  ): Promise<void> {
    try {
      const orderId = log.topics[1];
      const secret = log.topics[2];

      const secretReveal: SecretRevealEvent = {
        orderId,
        secret,
        blockNumber,
        transactionHash: txHash,
        timestamp: Date.now()
      };

      this.emit('secretRevealed', secretReveal);

      const escrowEvent: EscrowEvent = {
        type: 'SecretRevealed',
        orderId,
        transactionHash: txHash,
        blockNumber,
        timestamp: Date.now(),
        data: { secret }
      };

      this.emit('escrowEvent', escrowEvent);

      console.log(`Secret revealed on Ethereum for order ${orderId}: ${secret}`);

    } catch (error) {
      console.error('Error handling SecretRevealed event:', error);
    }
  }

  private async handleEscrowCreatedEvent(
    log: ethers.Log,
    blockNumber: number,
    txHash: string
  ): Promise<void> {
    try {
      const orderId = log.topics[1];

      const escrowEvent: EscrowEvent = {
        type: 'EscrowCreated',
        orderId,
        transactionHash: txHash,
        blockNumber,
        timestamp: Date.now(),
        data: { address: log.address }
      };

      this.emit('escrowEvent', escrowEvent);

      console.log(`Escrow created on Ethereum for order ${orderId} at ${log.address}`);

    } catch (error) {
      console.error('Error handling EscrowCreated event:', error);
    }
  }

  private async handleWithdrawnEvent(
    log: ethers.Log,
    blockNumber: number,
    txHash: string
  ): Promise<void> {
    try {
      const orderId = log.topics[1];
      const recipient = '0x' + log.topics[2].slice(26);

      const escrowEvent: EscrowEvent = {
        type: 'Withdrawn',
        orderId,
        transactionHash: txHash,
        blockNumber,
        timestamp: Date.now(),
        data: { recipient }
      };

      this.emit('escrowEvent', escrowEvent);

      console.log(`Withdrawal on Ethereum for order ${orderId} to ${recipient}`);

    } catch (error) {
      console.error('Error handling Withdrawn event:', error);
    }
  }

  private async monitorCardano(): Promise<void> {
    if (!this.lucid) return;

    try {
      const activeSwaps = await this.registry.getActiveSwaps();

      for (const swap of activeSwaps) {
        if (swap.params.chainIdDst === 2147484648 || swap.params.chainIdSrc === 2147484648) {
          await this.checkCardanoEscrow(swap.orderId);
        }
      }

    } catch (error) {
      console.error('Error monitoring Cardano:', error);
    }
  }

  private async checkCardanoEscrow(orderId: string): Promise<void> {
    if (!this.lucid) return;

    try {
      const swap = await this.registry.getSwap(orderId);
      if (!swap) return;

      if (swap.params.escrowAddressDst) {
        const utxos = await this.lucid.utxosAt(swap.params.escrowAddressDst);

        for (const utxo of utxos) {
          await this.processCardanoUtxo(utxo, orderId);
        }
      }

    } catch (error) {
      console.error(`Error checking Cardano escrow for ${orderId}:`, error);
    }
  }

  private async processCardanoUtxo(utxo: any, orderId: string): Promise<void> {
    try {
      if (!utxo.datum) return;

      const datum = fromHex(utxo.datum);


      const escrowEvent: EscrowEvent = {
        type: 'EscrowCreated',
        orderId,
        transactionHash: utxo.txHash,
        blockNumber: 0,
        timestamp: Date.now(),
        data: {
          utxoId: `${utxo.txHash}#${utxo.outputIndex}`,
          assets: utxo.assets
        }
      };

      this.emit('escrowEvent', escrowEvent);

    } catch (error) {
      console.error('Error processing Cardano UTXO:', error);
    }
  }

  async getChainStatus(): Promise<Record<number, ChainMonitor>> {
    const status: Record<number, ChainMonitor> = {};

    for (const [chainId, state] of this.chainStates.entries()) {
      status[chainId] = { ...state };
    }

    if (this.ethProvider) {
      try {
        const currentBlock = await this.ethProvider.getBlockNumber();
        if (status[1]) {
          status[1].lastBlock = currentBlock;
        }
      } catch (error) {
        console.error('Error getting Ethereum block:', error);
      }
    }

    return status;
  }

  async cleanup(): Promise<void> {
    this.stop();
    this.removeAllListeners();
  }
}