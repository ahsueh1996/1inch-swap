# CardanoSwap+ Frontend

A modern, responsive frontend for cross-chain atomic swaps between Ethereum and Cardano ecosystems. Built with Next.js, TypeScript, and Tailwind CSS, integrated with 1inch Fusion for optimal routing and our custom Cardano validators.

## Features

### 🌉 Cross-Chain Swaps
- **Ethereum ↔ Cardano**: Seamless asset exchange between EVM and Cardano
- **Multi-Chain Support**: Ethereum, Polygon, Arbitrum, BSC → Cardano
- **Atomic Guarantees**: HTLC-based swaps with cryptographic security

### 🔒 Security & Trust
- **Trustless Architecture**: No centralized intermediaries
- **Atomic Swaps**: Hash Time-Locked Contracts ensure fund safety
- **Non-Custodial**: Users maintain control of their assets throughout

### ⚡ Optimized Trading
- **1inch Integration**: Best price execution via 1inch Fusion
- **Real-time Quotes**: Live pricing with configurable auto-refresh
- **Minimal Slippage**: Advanced routing for optimal exchange rates

### 🎯 User Experience
- **Intuitive Interface**: Clean, responsive design for all devices
- **Wallet Integration**: Support for MetaMask, Nami, Eternl, and more
- **Real-time Progress**: Live transaction monitoring and status updates
- **Customizable Settings**: Slippage tolerance, deadline configuration

## Architecture

### Frontend Stack
- **Next.js 14**: React framework with SSR and optimization
- **TypeScript**: Type-safe development and better DX
- **Tailwind CSS**: Utility-first styling with dark mode support
- **Framer Motion**: Smooth animations and transitions
- **Zustand**: Lightweight state management

### Blockchain Integration
- **Ethereum**: Ethers.js for wallet connection and transactions
- **Cardano**: Lucid for UTXO management and smart contracts
- **1inch Fusion**: Cross-chain routing and price optimization
- **Custom Validators**: PlutusV3 contracts for Cardano-side operations

### Services & APIs
- **1inch API**: Quote aggregation and swap execution
- **Blockfrost**: Cardano blockchain data and submission
- **Custom Relayer**: Cross-chain coordination and monitoring
- **WebSocket**: Real-time updates and progress tracking

## Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- Git for version control

### Installation

1. **Navigate to the frontend directory**
   ```bash
   cd 1inch-swap/cardanoswapplus-frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env.local
   ```

4. **Configure environment variables**
   ```bash
   # Required API keys
   NEXT_PUBLIC_ONEINCH_API_KEY=your_1inch_api_key
   NEXT_PUBLIC_BLOCKFROST_API_KEY=your_blockfrost_api_key

   # Optional: Custom RPC URLs
   NEXT_PUBLIC_ETHEREUM_RPC_URL=your_ethereum_rpc
   NEXT_PUBLIC_POLYGON_RPC_URL=your_polygon_rpc

   # Relayer endpoints (if running locally)
   NEXT_PUBLIC_RELAYER_URL=http://localhost:3001
   NEXT_PUBLIC_RELAYER_WS_URL=ws://localhost:3001/ws
   ```

5. **Start development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

6. **Open in browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### API Keys Setup

#### 1inch API Key
1. Visit [1inch Developer Portal](https://portal.1inch.dev/)
2. Create an account and generate an API key
3. Add key to `NEXT_PUBLIC_ONEINCH_API_KEY`

#### Blockfrost API Key
1. Visit [Blockfrost](https://blockfrost.io/)
2. Sign up and create a new project
3. Choose mainnet or testnet based on your needs
4. Add project ID to `NEXT_PUBLIC_BLOCKFROST_API_KEY`

## Usage Guide

### Connecting Wallets

#### Ethereum Wallets
- **MetaMask**: Most popular Ethereum wallet
- **WalletConnect**: Mobile wallet support
- **Coinbase Wallet**: Integrated support

#### Cardano Wallets
- **Nami**: Browser extension wallet
- **Eternl**: Full-featured Cardano wallet
- **Flint**: Lightweight wallet option
- **Typhon**: Advanced features wallet

### Performing Swaps

1. **Connect Wallets**: Connect both source and destination wallets
2. **Select Assets**: Choose tokens and chains for your swap
3. **Enter Amount**: Specify the amount you want to swap
4. **Review Quote**: Check exchange rate, fees, and timing
5. **Configure Settings**: Adjust slippage tolerance if needed
6. **Execute Swap**: Confirm transaction in your wallets
7. **Monitor Progress**: Track the swap through completion

### Supported Swap Directions

#### From Ethereum Ecosystem
- **ETH → ADA**: Ethereum to Cardano native token
- **USDC → ADA**: USD Coin to Cardano
- **WBTC → ADA**: Wrapped Bitcoin to Cardano
- **MATIC → ADA**: Polygon to Cardano
- **Custom Tokens**: Any ERC-20 to ADA

#### From Cardano Ecosystem
- **ADA → ETH**: Cardano to Ethereum
- **ADA → USDC**: Cardano to USD Coin
- **ADA → MATIC**: Cardano to Polygon
- **Native Tokens**: Cardano assets to EVM tokens

## Development

### Project Structure
```
src/
├── components/          # React components
│   ├── SwapInterface.tsx
│   ├── TokenSelector.tsx
│   ├── ChainSelector.tsx
│   └── ...
├── services/           # External service integrations
│   ├── oneinchService.ts
│   ├── cardanoService.ts
│   └── relayerService.ts
├── store/              # State management
│   ├── swapStore.ts
│   └── walletStore.ts
├── types/              # TypeScript type definitions
├── config/             # Chain and token configurations
├── utils/              # Utility functions
└── styles/             # Global styles
```

### Key Components

#### SwapInterface
Main swap interface component handling user interactions, wallet connections, and swap execution.

#### TokenSelector
Modal component for selecting tokens with search, filtering, and balance display.

#### ChainSelector
Network selection component supporting both EVM and Cardano chains.

#### SwapQuoteDisplay
Real-time quote display with detailed breakdown of fees, routes, and timing.

### State Management

#### SwapStore
Manages swap-related state including tokens, amounts, quotes, and transaction progress.

#### WalletStore
Handles wallet connections, balances, and blockchain interactions for both Ethereum and Cardano.

### Building for Production

```bash
npm run build
npm run start
```

## Integration with Backend Services

### Cardano Validator Integration
The frontend integrates with our custom Cardano validators:

```typescript
import {
  FusionEscrowSrcBuilder,
  FusionEscrowBuilder,
  cardanoService
} from '@/services/cardanoService';

// Deploy source escrow on Cardano
const deployTx = await cardanoService.deploySourceEscrow({
  fromToken,
  toToken,
  amount,
  secretHash,
  // ... other parameters
});
```

### Relayer Service
Communicates with the cross-chain relayer for coordination:

```typescript
import { relayerService } from '@/services/relayerService';

// Submit swap order to relayer
const order = await relayerService.submitSwapOrder(
  swapParams,
  fromAddress,
  toAddress
);

// Monitor progress via WebSocket
relayerService.on('swapStatusUpdate', (update) => {
  // Handle real-time updates
});
```

### 1inch Integration
Leverages 1inch for optimal routing and execution:

```typescript
import { oneInchService } from '@/services/oneinchService';

// Get best quote from 1inch
const quote = await oneInchService.getQuote(swapParams);

// Execute swap through 1inch
const txHash = await oneInchService.executeSwap(
  swapParams,
  walletAddress,
  signer
);
```

## Testing

### Running Tests
```bash
npm run test
# or
yarn test
```

### Test Categories
- **Unit Tests**: Component and service testing
- **Integration Tests**: Cross-service functionality
- **E2E Tests**: Full swap flow validation

### Manual Testing Checklist
- [ ] Wallet connection (Ethereum + Cardano)
- [ ] Token selection and balance display
- [ ] Quote generation and refresh
- [ ] Settings configuration
- [ ] Swap execution and monitoring
- [ ] Error handling and edge cases

## Deployment

### Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Docker Deployment
```bash
# Build Docker image
docker build -t cross-chain-swap .

# Run container
docker run -p 3000:3000 cross-chain-swap
```

### Environment Variables for Production
```bash
# API Keys (required)
NEXT_PUBLIC_ONEINCH_API_KEY=
NEXT_PUBLIC_BLOCKFROST_API_KEY=

# RPC URLs (recommended for reliability)
NEXT_PUBLIC_ETHEREUM_RPC_URL=
NEXT_PUBLIC_POLYGON_RPC_URL=

# Relayer endpoints
NEXT_PUBLIC_RELAYER_URL=https://your-relayer-domain.com
NEXT_PUBLIC_RELAYER_WS_URL=wss://your-relayer-domain.com/ws

# Application settings
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_NETWORK=mainnet
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Use conventional commit messages
- Add tests for new functionality
- Update documentation as needed
- Ensure responsive design compatibility

## Security Considerations

### Best Practices
- Never store private keys in the frontend
- Validate all user inputs and external data
- Use HTTPS in production environments
- Implement proper error boundaries
- Regular dependency updates

### Smart Contract Integration
- Always verify contract addresses
- Implement proper allowance management
- Handle transaction failures gracefully
- Provide clear user feedback for all operations

## Troubleshooting

### Common Issues

#### Wallet Connection Fails
- Ensure wallet extension is installed and unlocked
- Check if wallet supports the target network
- Verify browser compatibility

#### Quote Generation Fails
- Check API key configuration
- Verify network connectivity
- Ensure token addresses are correct

#### Transaction Failures
- Confirm sufficient balance for gas fees
- Check wallet approval for token spending
- Verify network congestion status

### Support Resources
- [1inch Documentation](https://docs.1inch.io/)
- [Cardano Developer Resources](https://developers.cardano.org/)
- [Lucid Documentation](https://lucid.spacebudz.io/)

## License

This project is built for ETHNewDelhi 2025 Hackathon and follows open-source principles.

## Acknowledgments

- **1inch Team**: For the excellent Fusion infrastructure
- **Cardano Foundation**: For the robust blockchain platform
- **PLU-TS Team**: For the Cardano development tools
- **ETHNewDelhi 2025**: For the hackathon opportunity

---

Built with ❤️ for the DeFi community by the Cross-Chain Swap Team