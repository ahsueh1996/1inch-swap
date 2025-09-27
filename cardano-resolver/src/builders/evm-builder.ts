import { ethers, Contract, TransactionRequest, TransactionResponse } from 'ethers';
import Sdk from '@1inch/cross-chain-sdk';
import { FusionOrder } from '../resolver';

export class EVMTransactionBuilder {
  private wallet: ethers.Wallet;
  private fusionContract: Contract;
  private escrowFactory: Contract;

  constructor(wallet: ethers.Wallet) {
    this.wallet = wallet;

    // Initialize contracts with 1inch Fusion and escrow factory ABIs
    this.fusionContract = new Contract(
      '0x119c71D3BbAc22029622cbaEc24854d3D32D2828', // 1inch Fusion router
      this.getFusionABI(),
      wallet
    );

    this.escrowFactory = new Contract(
      '0x0000000000000000000000000000000000000000', // Escrow factory address
      this.getEscrowFactoryABI(),
      wallet
    );
  }

  async fillOrder(order: FusionOrder, secret: string): Promise<string> {
    try {
      console.log(`🔄 Filling EVM order ${order.orderHash}`);

      // Create the fill transaction using 1inch Fusion SDK
      const fillTx: TransactionRequest = {
        to: this.fusionContract.target,
        data: this.fusionContract.interface.encodeFunctionData('fillOrder', [
          order.orderHash,
          order.maker,
          order.makerAsset,
          order.makingAmount,
          order.takerAsset,
          order.takingAmount,
          this.hashSecret(secret)
        ]),
        value: order.escrowExtension.srcSafetyDeposit || 0
      };

      // Estimate gas and set appropriate gas limit
      const gasEstimate = await this.wallet.estimateGas(fillTx);
      fillTx.gasLimit = gasEstimate * 120n / 100n; // 20% buffer

      // Send transaction
      const txResponse: TransactionResponse = await this.wallet.sendTransaction(fillTx);

      // Wait for confirmation
      const receipt = await txResponse.wait();
      if (!receipt) {
        throw new Error('Transaction failed');
      }

      console.log(`✅ EVM order filled: ${receipt.hash}`);
      return receipt.hash;

    } catch (error) {
      console.error('Failed to fill EVM order:', error);
      throw error;
    }
  }

  async deployEscrow(order: FusionOrder, secretHash: string): Promise<string> {
    try {
      console.log(`🏗️ Deploying EVM escrow for ${order.orderHash}`);

      const escrowParams = {
        maker: order.maker,
        taker: this.wallet.address,
        token: order.makerAsset,
        amount: order.makingAmount,
        secretHash,
        timelock: order.deadline,
        refundTime: order.deadline + (24 * 60 * 60) // 24 hours after deadline
      };

      const deployTx: TransactionRequest = {
        to: this.escrowFactory.target,
        data: this.escrowFactory.interface.encodeFunctionData('deployEscrow', [
          escrowParams.maker,
          escrowParams.taker,
          escrowParams.token,
          escrowParams.amount,
          escrowParams.secretHash,
          escrowParams.timelock,
          escrowParams.refundTime
        ]),
        value: order.escrowExtension.srcSafetyDeposit || 0
      };

      const gasEstimate = await this.wallet.estimateGas(deployTx);
      deployTx.gasLimit = gasEstimate * 120n / 100n;

      const txResponse = await this.wallet.sendTransaction(deployTx);
      const receipt = await txResponse.wait();

      if (!receipt) {
        throw new Error('Escrow deployment failed');
      }

      console.log(`✅ EVM escrow deployed: ${receipt.hash}`);
      return receipt.hash;

    } catch (error) {
      console.error('Failed to deploy EVM escrow:', error);
      throw error;
    }
  }

  async claimFunds(order: FusionOrder, secret: string): Promise<string> {
    try {
      console.log(`💰 Claiming EVM funds for ${order.orderHash}`);

      // Get escrow address from previous deployment
      const escrowAddress = await this.getEscrowAddress(order);

      const claimTx: TransactionRequest = {
        to: escrowAddress,
        data: this.escrowFactory.interface.encodeFunctionData('claim', [
          secret,
          order.orderHash
        ])
      };

      const gasEstimate = await this.wallet.estimateGas(claimTx);
      claimTx.gasLimit = gasEstimate * 120n / 100n;

      const txResponse = await this.wallet.sendTransaction(claimTx);
      const receipt = await txResponse.wait();

      if (!receipt) {
        throw new Error('Claim transaction failed');
      }

      console.log(`✅ EVM funds claimed: ${receipt.hash}`);
      return receipt.hash;

    } catch (error) {
      console.error('Failed to claim EVM funds:', error);
      throw error;
    }
  }

  async cancelEscrow(order: FusionOrder): Promise<string> {
    try {
      console.log(`❌ Cancelling EVM escrow for ${order.orderHash}`);

      const escrowAddress = await this.getEscrowAddress(order);

      const cancelTx: TransactionRequest = {
        to: escrowAddress,
        data: this.escrowFactory.interface.encodeFunctionData('cancel', [
          order.orderHash
        ])
      };

      const gasEstimate = await this.wallet.estimateGas(cancelTx);
      cancelTx.gasLimit = gasEstimate * 120n / 100n;

      const txResponse = await this.wallet.sendTransaction(cancelTx);
      const receipt = await txResponse.wait();

      if (!receipt) {
        throw new Error('Cancel transaction failed');
      }

      console.log(`✅ EVM escrow cancelled: ${receipt.hash}`);
      return receipt.hash;

    } catch (error) {
      console.error('Failed to cancel EVM escrow:', error);
      throw error;
    }
  }

  async checkSecretRevealed(orderHash: string): Promise<string | null> {
    try {
      // Monitor logs for secret reveal events
      const filter = this.escrowFactory.filters.SecretRevealed(orderHash);
      const logs = await this.escrowFactory.queryFilter(filter, -1000); // Last 1000 blocks

      if (logs.length > 0) {
        const event = logs[logs.length - 1];
        return event.args?.secret || null;
      }

      return null;
    } catch (error) {
      console.error('Error checking secret reveal:', error);
      return null;
    }
  }

  private async getEscrowAddress(order: FusionOrder): Promise<string> {
    // Calculate deterministic escrow address or query from events
    const filter = this.escrowFactory.filters.EscrowDeployed(order.orderHash);
    const logs = await this.escrowFactory.queryFilter(filter);

    if (logs.length === 0) {
      throw new Error(`No escrow found for order ${order.orderHash}`);
    }

    return logs[0].args?.escrowAddress || '';
  }

  private hashSecret(secret: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(secret));
  }

  private getFusionABI(): string[] {
    return [
      'function fillOrder(bytes32 orderHash, address maker, address makerAsset, uint256 makingAmount, address takerAsset, uint256 takingAmount, bytes32 secretHash) external payable',
      'event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makingAmount, uint256 takingAmount)'
    ];
  }

  private getEscrowFactoryABI(): string[] {
    return [
      'function deployEscrow(address maker, address taker, address token, uint256 amount, bytes32 secretHash, uint256 timelock, uint256 refundTime) external payable returns (address)',
      'function claim(string secret, bytes32 orderHash) external',
      'function cancel(bytes32 orderHash) external',
      'event EscrowDeployed(bytes32 indexed orderHash, address indexed escrowAddress)',
      'event SecretRevealed(bytes32 indexed orderHash, string secret)',
      'event FundsClaimed(bytes32 indexed orderHash, address indexed claimer)',
      'event EscrowCancelled(bytes32 indexed orderHash)'
    ];
  }
}