import { SwapParams, ValidationResult, RelayerConfig } from '../types';
import { ethers } from 'ethers';

export class ParameterValidator {
  constructor(private config: RelayerConfig) {}

  validateSwapParams(params: SwapParams): ValidationResult {
    const errors: string[] = [];

    if (!this.isValidAddress(params.makerAddress)) {
      errors.push('Invalid maker address');
    }

    if (!this.isValidAddress(params.takerAddress)) {
      errors.push('Invalid taker address');
    }

    if (!this.isValidTokenAddress(params.srcToken, params.chainIdSrc)) {
      errors.push('Invalid source token address');
    }

    if (!this.isValidTokenAddress(params.dstToken, params.chainIdDst)) {
      errors.push('Invalid destination token address');
    }

    if (!this.isValidAmount(params.srcAmount)) {
      errors.push('Invalid source amount');
    }

    if (!this.isValidAmount(params.dstAmount)) {
      errors.push('Invalid destination amount');
    }

    if (!this.isValidHashlock(params.hashlock)) {
      errors.push('Invalid hashlock format');
    }

    const deadlineValidation = this.validateDeadlines(params);
    if (!deadlineValidation.valid) {
      errors.push(...deadlineValidation.errors);
    }

    const chainValidation = this.validateChainIds(params);
    if (!chainValidation.valid) {
      errors.push(...chainValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateRatio(srcAmount: string, dstAmount: string, expectedRatio: number): ValidationResult {
    const errors: string[] = [];

    try {
      const srcAmountBN = ethers.parseUnits(srcAmount, 18);
      const dstAmountBN = ethers.parseUnits(dstAmount, 18);

      const actualRatio = Number(ethers.formatUnits(dstAmountBN * BigInt(1e18) / srcAmountBN, 18));
      const tolerance = this.config.validationTolerance;

      const minRatio = expectedRatio * (1 - tolerance);
      const maxRatio = expectedRatio * (1 + tolerance);

      if (actualRatio < minRatio || actualRatio > maxRatio) {
        errors.push(`Ratio ${actualRatio} outside tolerance range [${minRatio}, ${maxRatio}]`);
      }
    } catch (error) {
      errors.push('Failed to validate ratio: invalid amounts');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateOrderConsistency(
    makerParams: SwapParams,
    fusionOrderParams: any
  ): ValidationResult {
    const errors: string[] = [];

    if (makerParams.srcToken.toLowerCase() !== fusionOrderParams.makerAsset?.toLowerCase()) {
      errors.push('Source token mismatch between maker escrow and fusion order');
    }

    if (makerParams.dstToken.toLowerCase() !== fusionOrderParams.takerAsset?.toLowerCase()) {
      errors.push('Destination token mismatch between maker escrow and fusion order');
    }

    if (makerParams.srcAmount !== fusionOrderParams.makingAmount) {
      errors.push('Source amount mismatch between maker escrow and fusion order');
    }

    if (makerParams.hashlock !== fusionOrderParams.hashlock) {
      errors.push('Hashlock mismatch between maker escrow and fusion order');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private isValidAddress(address: string): boolean {
    try {
      return ethers.isAddress(address);
    } catch {
      return false;
    }
  }

  private isValidTokenAddress(token: string, chainId: number): boolean {
    if (chainId === 1 || chainId === 5) {
      return this.isValidAddress(token);
    }

    if (chainId === 2147484648) {
      return this.isValidCardanoAsset(token);
    }

    return false;
  }

  private isValidCardanoAsset(asset: string): boolean {
    if (asset === 'ADA' || asset === 'lovelace') {
      return true;
    }

    const parts = asset.split('.');
    if (parts.length !== 2) {
      return false;
    }

    const [policyId, tokenName] = parts;
    return (
      /^[a-fA-F0-9]{56}$/.test(policyId) &&
      /^[a-fA-F0-9]*$/.test(tokenName) &&
      tokenName.length % 2 === 0
    );
  }

  private isValidAmount(amount: string): boolean {
    try {
      const bn = ethers.parseUnits(amount, 18);
      return bn > 0n;
    } catch {
      return false;
    }
  }

  private isValidHashlock(hashlock: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(hashlock);
  }

  private validateDeadlines(params: SwapParams): ValidationResult {
    const errors: string[] = [];
    const now = Math.floor(Date.now() / 1000);

    if (params.userDeadline <= now + this.config.userDeadlineBuffer) {
      errors.push(
        `User deadline too soon: ${params.userDeadline} <= ${now + this.config.userDeadlineBuffer}`
      );
    }

    if (params.cancelAfter <= now + this.config.cancelAfterBuffer) {
      errors.push(
        `Cancel deadline too soon: ${params.cancelAfter} <= ${now + this.config.cancelAfterBuffer}`
      );
    }

    if (params.userDeadline >= params.cancelAfter) {
      errors.push(
        `User deadline must be before cancel deadline: ${params.userDeadline} >= ${params.cancelAfter}`
      );
    }

    const minGap = 1800;
    if (params.cancelAfter - params.userDeadline < minGap) {
      errors.push(
        `Insufficient gap between deadlines: ${params.cancelAfter - params.userDeadline} < ${minGap}`
      );
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private validateChainIds(params: SwapParams): ValidationResult {
    const errors: string[] = [];
    const supportedChains = [1, 5, 2147484648];

    if (!supportedChains.includes(params.chainIdSrc)) {
      errors.push(`Unsupported source chain: ${params.chainIdSrc}`);
    }

    if (!supportedChains.includes(params.chainIdDst)) {
      errors.push(`Unsupported destination chain: ${params.chainIdDst}`);
    }

    if (params.chainIdSrc === params.chainIdDst) {
      errors.push('Source and destination chains must be different');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateSecret(secret: string, hashlock: string): boolean {
    try {
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));
      return secretHash.toLowerCase() === hashlock.toLowerCase();
    } catch {
      return false;
    }
  }
}