import { randomBytes, createHash } from 'crypto';
import { EventEmitter } from 'events';

interface SecretInfo {
  secret: string;
  hash: string;
  orderHash: string;
  evmTx?: string;
  cardanoTx?: string;
  revealed: boolean;
  revealedOn?: 'evm' | 'cardano';
  revealTx?: string;
  createdAt: Date;
}

export class SecretManager extends EventEmitter {
  private secrets = new Map<string, SecretInfo>();
  private monitoringIntervals = new Map<string, NodeJS.Timeout>();

  constructor() {
    super();
  }

  generateSecret(): string {
    // Generate a cryptographically secure random secret
    const secretBytes = randomBytes(32);
    return secretBytes.toString('hex');
  }

  hashSecret(secret: string): string {
    // Use SHA-256 for secret hash (compatible with both EVM and Cardano)
    return createHash('sha256').update(secret).digest('hex');
  }

  storeSecret(orderHash: string, secret: string, evmTx?: string, cardanoTx?: string): void {
    const secretInfo: SecretInfo = {
      secret,
      hash: this.hashSecret(secret),
      orderHash,
      evmTx,
      cardanoTx,
      revealed: false,
      createdAt: new Date()
    };

    this.secrets.set(orderHash, secretInfo);
    console.log(`🔐 Secret stored for order ${orderHash}`);
  }

  async propagateSecret(orderHash: string, secret: string, evmTx: string, cardanoTx: string): Promise<void> {
    console.log(`🚀 Starting secret propagation for ${orderHash}`);

    // Store the secret with transaction references
    this.storeSecret(orderHash, secret, evmTx, cardanoTx);

    // Start monitoring for secret reveals
    this.startSecretMonitoring(orderHash);

    this.emit('secretPropagationStarted', { orderHash, secret });
  }

  async checkSecretRevealed(orderHash: string): Promise<string | null> {
    const secretInfo = this.secrets.get(orderHash);
    if (!secretInfo) {
      return null;
    }

    if (secretInfo.revealed) {
      return secretInfo.secret;
    }

    // Check both chains for secret revelation
    const evmSecret = await this.checkEVMSecretReveal(secretInfo);
    if (evmSecret) {
      return this.handleSecretRevealed(orderHash, evmSecret, 'evm');
    }

    const cardanoSecret = await this.checkCardanoSecretReveal(secretInfo);
    if (cardanoSecret) {
      return this.handleSecretRevealed(orderHash, cardanoSecret, 'cardano');
    }

    return null;
  }

  private startSecretMonitoring(orderHash: string): void {
    // Monitor every 15 seconds for secret reveals
    const interval = setInterval(async () => {
      try {
        const revealedSecret = await this.checkSecretRevealed(orderHash);
        if (revealedSecret) {
          this.stopSecretMonitoring(orderHash);
        }
      } catch (error) {
        console.error(`Error monitoring secret for ${orderHash}:`, error);
      }
    }, 15000);

    this.monitoringIntervals.set(orderHash, interval);
  }

  private stopSecretMonitoring(orderHash: string): void {
    const interval = this.monitoringIntervals.get(orderHash);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(orderHash);
    }
  }

  private async checkEVMSecretReveal(secretInfo: SecretInfo): Promise<string | null> {
    try {
      // This would integrate with the EVM builder to check for secret reveals
      // For now, return null - would need proper integration
      return null;
    } catch (error) {
      console.error('Error checking EVM secret reveal:', error);
      return null;
    }
  }

  private async checkCardanoSecretReveal(secretInfo: SecretInfo): Promise<string | null> {
    try {
      // This would integrate with the Cardano builder to check for secret reveals
      // For now, return null - would need proper integration
      return null;
    } catch (error) {
      console.error('Error checking Cardano secret reveal:', error);
      return null;
    }
  }

  private handleSecretRevealed(orderHash: string, secret: string, chain: 'evm' | 'cardano'): string {
    const secretInfo = this.secrets.get(orderHash);
    if (!secretInfo) {
      return secret;
    }

    // Verify the revealed secret matches our stored hash
    if (this.hashSecret(secret) !== secretInfo.hash) {
      console.error(`❌ Secret hash mismatch for ${orderHash}`);
      return secret;
    }

    // Update secret info
    secretInfo.revealed = true;
    secretInfo.revealedOn = chain;
    this.secrets.set(orderHash, secretInfo);

    console.log(`🔓 Secret revealed for ${orderHash} on ${chain}`);

    // Emit event for resolver to handle completion
    this.emit('secretRevealed', {
      orderHash,
      secret,
      chain,
      secretInfo
    });

    // Start cross-chain secret propagation
    this.propagateToOtherChain(orderHash, secret, chain);

    return secret;
  }

  private async propagateToOtherChain(orderHash: string, secret: string, sourceChain: 'evm' | 'cardano'): Promise<void> {
    const targetChain = sourceChain === 'evm' ? 'cardano' : 'evm';
    console.log(`🔄 Propagating secret from ${sourceChain} to ${targetChain} for ${orderHash}`);

    try {
      // This would trigger the claim transaction on the target chain
      this.emit('propagateSecret', {
        orderHash,
        secret,
        sourceChain,
        targetChain
      });
    } catch (error) {
      console.error(`Failed to propagate secret to ${targetChain}:`, error);
    }
  }

  getSecretInfo(orderHash: string): SecretInfo | undefined {
    return this.secrets.get(orderHash);
  }

  getAllSecrets(): Map<string, SecretInfo> {
    return new Map(this.secrets);
  }

  cleanup(orderHash: string): void {
    this.stopSecretMonitoring(orderHash);
    this.secrets.delete(orderHash);
    console.log(`🧹 Cleaned up secret for ${orderHash}`);
  }

  // Security method to validate secret against hash
  validateSecret(secret: string, expectedHash: string): boolean {
    return this.hashSecret(secret) === expectedHash;
  }

  // Method to generate time-locked secrets for additional security
  generateTimeLockSecret(baseSecret: string, timelock: number): string {
    const timeLockData = `${baseSecret}:${timelock}`;
    return createHash('sha256').update(timeLockData).digest('hex');
  }
}