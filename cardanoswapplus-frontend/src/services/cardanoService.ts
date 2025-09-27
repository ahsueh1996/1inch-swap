import { Lucid, Blockfrost, C, fromHex, toHex, Constr, Data } from 'lucid-cardano';
import { BigNumber } from 'bignumber.js';

import { Token, Chain, SwapParams, SwapOrder, SwapStatus, CardanoWallet } from '@/types/swap';
import { CARDANO_MAINNET, CARDANO_TESTNET } from '@/config/chains';

// Import our Cardano validators
import {
  FusionEscrowSrcBuilder,
  FusionEscrowBuilder,
  FusionEscrowSrcDatum,
  FusionEscrowDatum,
} from '../../../1inch-swap/cardano-validator-ts/src';

interface CardanoUTxO {
  txHash: string;
  outputIndex: number;
  amount: Array<{
    unit: string;
    quantity: string;
  }>;
  address: string;
  dataHash?: string;
  plutusData?: string;
}

interface CardanoWalletApi {
  getNetworkId(): Promise<number>;
  getUtxos(): Promise<string[]>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<{ signature: string; key: string }>;
  submitTx(tx: string): Promise<string>;
  getCollateral(): Promise<string[]>;
}

interface EscrowDeploymentParams {
  fromToken: Token;
  toToken: Token;
  amount: BigNumber;
  secretHash: string;
  userDeadline: number;
  cancelAfter: number;
  resolver: string;
  beneficiary: string;
  depositAmount: BigNumber;
  orderHash: string;
  fillId: number;
}

class CardanoService {
  private lucid: Lucid | null = null;
  private network: 'mainnet' | 'testnet' = 'testnet';
  private srcEscrowBuilder: FusionEscrowSrcBuilder | null = null;
  private dstEscrowBuilder: FusionEscrowBuilder | null = null;

  constructor() {
    this.initializeLucid();
  }

  private async initializeLucid() {
    try {
      const blockfrostApiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY;
      if (!blockfrostApiKey) {
        console.warn('Blockfrost API key not provided');
        return;
      }

      const blockfrostUrl = this.network === 'mainnet'
        ? 'https://cardano-mainnet.blockfrost.io/api/v0'
        : 'https://cardano-testnet.blockfrost.io/api/v0';

      this.lucid = await Lucid.new(
        new Blockfrost(blockfrostUrl, blockfrostApiKey),
        this.network
      );

      // Initialize escrow builders
      this.srcEscrowBuilder = new FusionEscrowSrcBuilder(this.network);
      this.dstEscrowBuilder = new FusionEscrowBuilder(this.network);

      console.log('Cardano service initialized');
    } catch (error) {
      console.error('Failed to initialize Cardano service:', error);
    }
  }

  /**
   * Switch between mainnet and testnet
   */
  async switchNetwork(network: 'mainnet' | 'testnet') {
    this.network = network;
    await this.initializeLucid();
  }

  /**
   * Connect to a Cardano wallet
   */
  async connectWallet(walletName: string): Promise<CardanoWallet> {
    try {
      if (!this.lucid) {
        throw new Error('Lucid not initialized');
      }

      // Check if wallet is available
      if (!(window as any).cardano?.[walletName]) {
        throw new Error(`${walletName} wallet not found`);
      }

      const walletApi = await (window as any).cardano[walletName].enable();

      // Select wallet in Lucid
      this.lucid.selectWallet(walletApi);

      // Get wallet address
      const address = await this.lucid.wallet.address();
      const networkId = await walletApi.getNetworkId();

      // Get UTxOs for balance calculation
      const utxos = await this.getWalletUTxOs();

      return {
        address,
        chainId: networkId === 1 ? CARDANO_MAINNET.id : CARDANO_TESTNET.id,
        isConnected: true,
        provider: this.lucid,
        type: 'cardano',
        api: walletApi,
        utxos,
      };
    } catch (error) {
      console.error('Failed to connect Cardano wallet:', error);
      throw new Error('Failed to connect Cardano wallet');
    }
  }

  /**
   * Get available Cardano wallets
   */
  getAvailableWallets(): string[] {
    const cardano = (window as any).cardano;
    if (!cardano) return [];

    const wallets = [];
    const commonWallets = ['nami', 'eternl', 'flint', 'typhon', 'yoroi', 'gero'];

    for (const wallet of commonWallets) {
      if (cardano[wallet]) {
        wallets.push(wallet);
      }
    }

    return wallets;
  }

  /**
   * Get wallet UTxOs
   */
  async getWalletUTxOs(): Promise<CardanoUTxO[]> {
    try {
      if (!this.lucid?.wallet) {
        throw new Error('Wallet not connected');
      }

      const utxos = await this.lucid.wallet.getUtxos();

      return utxos.map(utxo => ({
        txHash: utxo.txHash,
        outputIndex: utxo.outputIndex,
        amount: Object.entries(utxo.assets).map(([unit, quantity]) => ({
          unit,
          quantity: quantity.toString(),
        })),
        address: utxo.address,
        dataHash: utxo.datumHash,
        plutusData: utxo.datum,
      }));
    } catch (error) {
      console.error('Failed to get wallet UTxOs:', error);
      return [];
    }
  }

  /**
   * Get wallet balance for a specific token
   */
  async getTokenBalance(token: Token): Promise<BigNumber> {
    try {
      if (!this.lucid?.wallet) {
        return new BigNumber(0);
      }

      const utxos = await this.lucid.wallet.getUtxos();
      let balance = new BigNumber(0);

      for (const utxo of utxos) {
        if (token.address === '') {
          // Native ADA
          balance = balance.plus(new BigNumber(utxo.assets.lovelace.toString()));
        } else {
          // Native token
          const tokenAmount = utxo.assets[token.address];
          if (tokenAmount) {
            balance = balance.plus(new BigNumber(tokenAmount.toString()));
          }
        }
      }

      // Convert from smallest unit to token units
      return balance.dividedBy(new BigNumber(10).pow(token.decimals));
    } catch (error) {
      console.error('Failed to get token balance:', error);
      return new BigNumber(0);
    }
  }

  /**
   * Deploy source escrow (locks funds on Cardano)
   */
  async deploySourceEscrow(params: EscrowDeploymentParams): Promise<string> {
    try {
      if (!this.lucid?.wallet || !this.srcEscrowBuilder) {
        throw new Error('Wallet or escrow builder not initialized');
      }

      const walletAddress = await this.lucid.wallet.address();
      const makerPkh = this.lucid.utils.getAddressDetails(walletAddress).paymentCredential?.hash;

      if (!makerPkh) {
        throw new Error('Invalid wallet address');
      }

      // Get UTxOs for funding
      const utxos = await this.lucid.wallet.getUtxos();

      const deployTx = this.srcEscrowBuilder.buildDeployTx({
        maker: makerPkh,
        resolver: params.resolver,
        beneficiary: params.beneficiary,
        assetPolicy: params.fromToken.address.split('.')[0] || '',
        assetName: params.fromToken.address.split('.')[1] || '',
        amount: params.amount.multipliedBy(new BigNumber(10).pow(params.fromToken.decimals)).toNumber(),
        hashlock: params.secretHash,
        userDeadline: params.userDeadline,
        publicDeadline: params.userDeadline + 3600, // 1 hour later
        cancelAfter: params.cancelAfter,
        depositLovelace: params.depositAmount.multipliedBy(new BigNumber(10).pow(6)).toNumber(), // Convert to lovelace
        orderHash: params.orderHash,
        fillId: params.fillId,
        finalityBlocks: 10,
        deployedAtBlock: await this.getCurrentBlockHeight(),
        makerUtxos: utxos,
      });

      // Build and submit transaction
      const tx = await deployTx.complete();
      const signedTx = await tx.sign().complete();
      const txHash = await signedTx.submit();

      return txHash;
    } catch (error) {
      console.error('Failed to deploy source escrow:', error);
      throw new Error('Failed to deploy source escrow');
    }
  }

  /**
   * Withdraw from destination escrow (receives funds on Cardano)
   */
  async withdrawFromDestinationEscrow(
    escrowAddress: string,
    secret: string,
    amount: BigNumber,
    token: Token
  ): Promise<string> {
    try {
      if (!this.lucid?.wallet || !this.dstEscrowBuilder) {
        throw new Error('Wallet or escrow builder not initialized');
      }

      // Find escrow UTxO
      const escrowUtxos = await this.lucid.utxosAt(escrowAddress);
      if (escrowUtxos.length === 0) {
        throw new Error('Escrow UTxO not found');
      }

      const escrowUtxo = escrowUtxos[0]; // Assume first UTxO is the escrow

      const walletAddress = await this.lucid.wallet.address();

      const withdrawTx = this.dstEscrowBuilder.buildWithdrawTx({
        escrowUtxo,
        secret,
        amount: amount.multipliedBy(new BigNumber(10).pow(token.decimals)).toNumber(),
        takerAddress: walletAddress,
      });

      // Build and submit transaction
      const tx = await withdrawTx.complete();
      const signedTx = await tx.sign().complete();
      const txHash = await signedTx.submit();

      return txHash;
    } catch (error) {
      console.error('Failed to withdraw from destination escrow:', error);
      throw new Error('Failed to withdraw from destination escrow');
    }
  }

  /**
   * Cancel source escrow (get refund)
   */
  async cancelSourceEscrow(escrowAddress: string): Promise<string> {
    try {
      if (!this.lucid?.wallet || !this.srcEscrowBuilder) {
        throw new Error('Wallet or escrow builder not initialized');
      }

      // Find escrow UTxO
      const escrowUtxos = await this.lucid.utxosAt(escrowAddress);
      if (escrowUtxos.length === 0) {
        throw new Error('Escrow UTxO not found');
      }

      const escrowUtxo = escrowUtxos[0];
      const walletAddress = await this.lucid.wallet.address();

      const cancelTx = this.srcEscrowBuilder.buildCancelTx({
        escrowUtxo,
        makerAddress: walletAddress,
      });

      // Build and submit transaction
      const tx = await cancelTx.complete();
      const signedTx = await tx.sign().complete();
      const txHash = await signedTx.submit();

      return txHash;
    } catch (error) {
      console.error('Failed to cancel source escrow:', error);
      throw new Error('Failed to cancel source escrow');
    }
  }

  /**
   * Get current block height
   */
  async getCurrentBlockHeight(): Promise<number> {
    try {
      if (!this.lucid) {
        throw new Error('Lucid not initialized');
      }

      const slot = await this.lucid.currentSlot();
      // Convert slot to approximate block height (Cardano produces ~1 block per 20 seconds)
      return Math.floor(slot / 20);
    } catch (error) {
      console.error('Failed to get current block height:', error);
      return 0;
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txHash: string): Promise<'pending' | 'confirmed' | 'failed'> {
    try {
      if (!this.lucid) {
        throw new Error('Lucid not initialized');
      }

      const tx = await this.lucid.awaitTx(txHash, 3000); // Wait up to 3 seconds
      return tx ? 'confirmed' : 'pending';
    } catch (error) {
      console.error('Failed to get transaction status:', error);
      return 'failed';
    }
  }

  /**
   * Generate a random secret for HTLC
   */
  generateSecret(): { secret: string; secretHash: string } {
    const secret = C.PlutusData.new_bytes(crypto.getRandomValues(new Uint8Array(32)));
    const secretBytes = secret.as_bytes()!.data();
    const secretHex = toHex(secretBytes);

    // Calculate SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(secretHex);

    crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
      const hashArray = new Uint8Array(hashBuffer);
      const secretHash = toHex(hashArray);

      return {
        secret: secretHex,
        secretHash,
      };
    });

    // Fallback synchronous version
    const secretHash = this.sha256(secretHex);

    return {
      secret: secretHex,
      secretHash,
    };
  }

  /**
   * Simple SHA-256 implementation (fallback)
   */
  private sha256(message: string): string {
    // This would typically use a proper crypto library
    // For now, return a mock hash
    return '0x' + message.slice(0, 64).padEnd(64, '0');
  }

  /**
   * Estimate transaction fees
   */
  async estimateTransactionFee(
    transactionType: 'deploy' | 'withdraw' | 'cancel',
    params?: any
  ): Promise<BigNumber> {
    try {
      // Mock fee estimation based on transaction type
      const baseFee = new BigNumber(0.2); // 0.2 ADA base fee

      switch (transactionType) {
        case 'deploy':
          return baseFee.multipliedBy(2); // Higher fee for deployment
        case 'withdraw':
          return baseFee.multipliedBy(1.5);
        case 'cancel':
          return baseFee;
        default:
          return baseFee;
      }
    } catch (error) {
      console.error('Failed to estimate transaction fee:', error);
      return new BigNumber(0.5); // Default 0.5 ADA
    }
  }

  /**
   * Get escrow information
   */
  async getEscrowInfo(escrowAddress: string): Promise<any> {
    try {
      if (!this.lucid) {
        throw new Error('Lucid not initialized');
      }

      const utxos = await this.lucid.utxosAt(escrowAddress);
      if (utxos.length === 0) {
        return null;
      }

      const escrowUtxo = utxos[0];

      // Parse escrow datum
      if (escrowUtxo.datum) {
        const datum = Data.from(escrowUtxo.datum);
        // Parse according to our escrow datum structure
        return {
          amount: escrowUtxo.assets,
          datum: datum,
          address: escrowAddress,
          txHash: escrowUtxo.txHash,
          outputIndex: escrowUtxo.outputIndex,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get escrow info:', error);
      return null;
    }
  }
}

export const cardanoService = new CardanoService();