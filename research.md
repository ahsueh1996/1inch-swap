# How 1inch Works
- Pathfinder/solver network that discores best route (lowest cost) through a set of aggregated swap and defi tools
- Returns signed intents and settlement payloads

## Fusion
- Aka. intent swap
- Dutch auction (user specifies token and amount to sell)
- A set of resolvers compete to fill orders for best rate

## 1inch Fusion+
- Improved Fusion 
- Swaps betweena any two tokens on any supported evm chains

# How Existing Cardano <--> ETH works in [Ronakgupta11's CardanoSwap](https://github.com/ronakgupta11/cardano-swap)
- Not yet live in official 1inch 
- User locks assets (as HTLC on Cardano) on respective chains and resolver facilate swap on Cardano and EVM
- Resolver reveal a secret preimage
- Relayer shares secrets and handles coordination (non-custodially)
- Code distribution (# of files): 29 js, 34 ts, 16 sol

## Architecture Overview

**Multi-Chain Atomic Swap System** for EVM ↔ Cardano cross-chain swaps using Hash Time-Locked Contracts (HTLCs)

### Core Components

#### 1. EVM Smart Contracts
- **LimitOrderProtocol.sol**: Two-phase order execution (preInteraction + postInteraction)
- **EscrowFactory.sol**: Deploys deterministic escrow contracts using CREATE2
- **BaseEscrow.sol**: Abstract base with common escrow functionality
- **EscrowSrc.sol**: Source escrow for EVM→Cardano swaps
- **EscrowDst.sol**: Destination escrow for Cardano→EVM swaps

#### 2. Cardano Plutus Contract
- **contract.ts**: PlutusV3 validator implementing HTLC logic
- Hash-locked withdrawals with time-based access control
- Resolver-exclusive period before public access

#### 3. Backend Infrastructure
- **Node.js/Express API**: Order management and coordination
- **Order model**: PostgreSQL/Sequelize for swap tracking
- **WebSocket service**: Real-time order status updates

## Swap Flow Architecture

### EVM→Cardano Swap
1. **Maker** creates order with signature (LimitOrderProtocol.preInteraction)
2. **Resolver** accepts order, triggers escrow creation (postInteraction → EscrowFactory)
3. **EscrowSrc** deployed with ETH/ERC20 + safety deposit
4. **Resolver** creates corresponding Cardano escrow
5. **Secret reveal** enables withdrawals on both chains

### Cardano→EVM Swap
1. **Maker** creates Cardano escrow with hashlock
2. **Resolver** creates EVM EscrowDst with same hashlock
3. **Secret-based withdrawal** mechanism on both sides

## Key Technical Features

### Security Mechanisms
- **Safety deposits** prevent griefing attacks
- **Time-locked access** with resolver priority periods
- **CREATE2 deterministic addresses** for escrow predictability
- **EIP-712 signatures** for order authentication

### HTLC Implementation
- **SHA-256 hashlock** for secret commitment
- **Multi-stage timelocks**: resolver exclusive → public → cancellation
- **Access token gating** for public operations

### Cross-Chain Coordination
- **Backend API** coordinates multi-chain state
- **Order lifecycle management** (pending → depositing → withdrawing → completed)
- **Transaction hash tracking** for both chains
- **WebSocket notifications** for real-time updates

## Code Quality Observations

### Strengths
- Clean separation of concerns between chains
- Comprehensive error handling and validation
- Plutus V3 usage for latest Cardano features
- Proper safety deposit mechanisms

### Areas for Improvement
- Time validation complexity in Plutus contract
- Some commented-out timelock validations in EscrowSrc/EscrowDst
- Backend could benefit from more robust retry mechanisms
- Limited documentation on exact timelock periods

## Notable Implementation Details

- **Immutables struct** contains all escrow parameters for validation
- **Proxy pattern** for gas-efficient escrow deployment
- **Cardano address mapping** for cross-chain verification
- **Rescue funds** mechanism for emergency recovery
- **Public/private withdrawal** phases for operational flexibility

## How 1inch Infrastructure is Used

### 1inch-Derived Components

#### Library Architecture
- **AddressLib.sol**: 1inch's Address type wrapper for gas optimization
  - Custom type `Address is uint256` for efficient storage
  - Functions: `wrap(address)` and `get(Address)` for conversion
  - Originally from 1inch contract patterns

- **TimelocksLib.sol**: 1inch timelock management system
  - Compact storage of multiple timelock stages in single uint256
  - `Stage` enum: DstWithdrawal, DstPublicWithdrawal, DstCancellation
  - Deployment timestamp tracking with bitshift operations
  - Security annotation: `@custom:security-contact security@1inch.io`

- **ImmutablesLib.sol**: 1inch immutable data hashing
  - Gas-efficient hashing using assembly (`memory-safe`)
  - Standardized hash computation for escrow parameters
  - Constants: `ESCROW_IMMUTABLES_SIZE = 0x100`

- **ProxyHashLib.sol**: 1inch proxy deployment pattern
  - Computes bytecode hash for CREATE2 proxy deployments
  - Minimal proxy pattern compatible with 1inch factory designs
  - Deterministic address computation support

#### LimitOrderProtocol Integration
- **Two-Phase Architecture**: Direct implementation of 1inch's order pattern
  - Phase 1: `preInteraction()` - Maker validates and deposits funds
  - Phase 2: `postInteraction()` - Resolver/Taker completes the swap
  - EIP-712 signature validation following 1inch standards

#### Order Structure Compatibility
```solidity
struct Order {
    address maker;
    address makerAsset;
    address takerAsset;
    uint256 makingAmount;
    uint256 takingAmount;
    address receiver;
    bytes32 hashlock;     // Addition for atomic swaps
    uint256 salt;
}
```

### 1inch Pattern Adaptations

#### Factory Pattern Usage
- **EscrowFactory** inherits 1inch's `IPostInteraction` interface
- CREATE2 deployment with deterministic addresses
- Proxy cloning pattern from 1inch's gas optimization strategies
- Safety deposit validation integrated into postInteraction flow

#### Gas Optimization Techniques
- **Type wrapping**: Custom Address type reduces gas costs
- **Packed storage**: Timelocks compress multiple timestamps
- **Assembly usage**: Direct memory operations in hashing functions
- **Proxy deployment**: Minimal proxy pattern for escrow instances

#### Security Model Integration
- **Access token gating**: Public operations require token balance
- **Emergency rescue**: Taker-controlled fund recovery after timelock
- **Immutable validation**: Address verification using 1inch's hash patterns
- **Timelock management**: Multi-stage access control periods

### Implementation Differences from Standard 1inch

#### Atomic Swap Additions
- **Hashlock field** added to Order struct for secret commitment
- **Cross-chain coordination** via backend API (not in core 1inch)
- **Safety deposits** for griefing attack prevention
- **Cardano integration** through Plutus contracts

#### Modified Behaviors
- **postInteraction()** triggers escrow deployment instead of direct settlement
- **Access token requirement** for public operations (not standard in 1inch Fusion)
- **Time-based access control** with resolver priority periods
- **Multi-chain state management** through off-chain coordination