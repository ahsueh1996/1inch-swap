#!/usr/bin/env ts-node

/**
 * Compilation script for Fusion Cardano validators
 * Generates Plutus scripts and addresses for deployment
 */

import fs from 'fs';
import path from 'path';
import {
  fusionEscrowDstScript,
  fusionEscrowDstMainnetAddr,
  fusionEscrowDstTestnetAddr,
  compiledFusionEscrowDst
} from './validators/fusion-escrow-dst';

interface CompiledOutput {
  validators: {
    fusionEscrowDst: {
      type: string;
      description: string;
      compiledCode: string;
      hash: string;
      mainnetAddress: string;
      testnetAddress: string;
    };
  };
  metadata: {
    version: string;
    plutusVersion: string;
    compiler: string;
    generatedAt: string;
  };
}

function main() {
  console.log('🔨 Compiling Fusion Cardano Validators...');

  // Prepare output
  const output: CompiledOutput = {
    validators: {
      fusionEscrowDst: {
        type: "PlutusV3",
        description: "Fusion-compatible destination escrow validator with partial fill support",
        compiledCode: fusionEscrowDstScript.cbor.toString('hex'),
        hash: fusionEscrowDstScript.hash.toString(),
        mainnetAddress: fusionEscrowDstMainnetAddr.toBech32(),
        testnetAddress: fusionEscrowDstTestnetAddr.toBech32()
      }
    },
    metadata: {
      version: "1.0.0",
      plutusVersion: "v3",
      compiler: "@harmoniclabs/plu-ts",
      generatedAt: new Date().toISOString()
    }
  };

  // Ensure output directory exists
  const outputDir = path.join(__dirname, '..', 'plutus');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write compiled output
  const outputPath = path.join(outputDir, 'fusion-validators.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log('✅ Compilation complete!');
  console.log(`📄 Output written to: ${outputPath}`);
  console.log('\n📋 Summary:');
  console.log(`   - Fusion Escrow Dst: ${output.validators.fusionEscrowDst.hash}`);
  console.log(`   - Mainnet Address: ${output.validators.fusionEscrowDst.mainnetAddress}`);
  console.log(`   - Testnet Address: ${output.validators.fusionEscrowDst.testnetAddress}`);

  // Write individual Plutus scripts for deployment tools
  const scriptsDir = path.join(outputDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(scriptsDir, 'fusion-escrow-dst.plutus'),
    output.validators.fusionEscrowDst.compiledCode
  );

  console.log(`📜 Individual scripts written to: ${scriptsDir}`);
}

if (require.main === module) {
  main();
}