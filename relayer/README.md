# CardanoSwap+ Relayer Implementation

A complete implementation of the CardanoSwap+ Watcher/Relayer service for cross-chain HTLC swaps between EVM and Cardano networks.

## Overview

This relayer ensures fair and safe execution of cross-chain swaps by:

1. **Validating** maker ↔ taker swap parameters across chains
2. **Mediating** secret sharing between Maker and Resolver
3. **Enforcing** liveness by publishing secrets publicly if Resolver stalls
4. **Monitoring** deadlines and triggering refunds/cancels

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Swap Registry │    │ Parameter       │    │ Secret Mediator │
│   (SQLite)      │    │ Validator       │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Liveness        │    │ Timeout Monitor │    │ Chain Monitor   │
│ Enforcer        │    │                 │    │ Service         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                        ┌─────────────────┐
                        │   REST API      │
                        │                 │
                        └─────────────────┘
```

## Quick Start

### 1. Installation

```bash
cd relayer
npm install
```

### 2. Configuration

Copy the environment template:
```bash
cp .env.example .env
```

Edit `.env` with your configuration.

### 3. Build and Run

```bash
# Production
npm run build
npm start
```

## API Endpoints

The `API_SECRET` is whatever you set in your `.env`.

### Create Swap
```bash
POST /swaps
Authorization: Bearer {API_SECRET}

{
  "orderId": "order_123",
  "makerAddress": "0x...",
  "takerAddress": "0x...",
  "srcToken": "0x...",
  "dstToken": "ada",
  "srcAmount": "1000000000000000000",
  "dstAmount": "2000000",
  "hashlock": "0x...",
  "userDeadline": 1640995200,
  "cancelAfter": 1641000000,
  "chainIdSrc": 1,
  "chainIdDst": 2147484648
}
```

### Provide Secret
```bash
POST /swaps/{orderId}/secret
Authorization: Bearer {API_SECRET}

{
  "secret": "my_secret_preimage"
}
```

### Get Swap Status
```bash
GET /swaps/{orderId}
Authorization: Bearer {API_SECRET}
```

### Get All Active Swaps
```bash
GET /swaps?status=active
Authorization: Bearer {API_SECRET}
```

### Get Relayer Status
```bash
GET /status
Authorization: Bearer {API_SECRET}
```

### Force Reveal Secret
```bash
POST /swaps/{orderId}/force-reveal
Authorization: Bearer {API_SECRET}

{
  "reason": "emergency_reveal"
}
```

## Event Flow

1. **Swap Creation**: Maker creates swap intent, relayer validates parameters
2. **Secret Request**: Relayer requests secret from maker
3. **Secret Provision**: Maker provides secret, relayer validates against hashlock
4. **Resolver Ready**: When resolver wins auction, relayer shares secret
5. **Grace Period**: Relayer monitors resolver completion
6. **Liveness Enforcement**: If resolver stalls, secret is published publicly
7. **Completion**: Swap marked complete when secret is revealed on-chain

## Security Features

- **Parameter Validation**: Comprehensive validation of swap parameters
- **Secret Verification**: Secrets are verified against hashlocks before sharing
- **Deadline Monitoring**: Continuous monitoring of user and cancel deadlines
- **Grace Period Enforcement**: Configurable grace period before public reveal
- **Chain Monitoring**: Real-time monitoring of both EVM and Cardano chains
- **IPFS Publishing**: Optional publication of secrets to IPFS for transparency

## Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `MAX_SECRET_HOLD_TIME` | Grace period before public secret reveal (seconds) | 300 |
| `VALIDATION_TOLERANCE` | Allowed deviation in token amounts (%) | 0.01 |
| `POLL_INTERVAL` | Chain monitoring frequency (ms) | 10000 |
| `USER_DEADLINE_BUFFER` | Minimum time before user deadline (seconds) | 3600 |
| `CANCEL_AFTER_BUFFER` | Minimum time before cancel deadline (seconds) | 7200 |

## Development

### Project Structure

```
src/
├── api/           # REST API endpoints
├── database/      # SQLite database layer
├── services/      # Core business logic
│   ├── validator.ts    # Parameter validation
│   ├── mediator.ts     # Secret mediation
│   ├── enforcer.ts     # Liveness enforcement
│   ├── monitor.ts      # Timeout monitoring
│   └── chainMonitor.ts # Chain event monitoring
├── types/         # TypeScript type definitions
├── utils/         # Configuration and utilities
└── relayer.ts     # Main application entry point
```

## Monitoring and Observability

The relayer provides comprehensive logging and status endpoints:

- Real-time event logging with structured output
- Status endpoint showing chain sync status and active swaps
- Deadline monitoring with proactive alerts
- Error handling with graceful degradation

## Production Deployment

1. **Environment Setup**: Configure all required environment variables
2. **Database**: Ensure SQLite database directory is writable
3. **Network Access**: Verify connectivity to Ethereum and Cardano networks
4. **Monitoring**: Set up log aggregation and alerting
5. **Backup**: Regular backup of swap database
6. **Security**: Secure API secret and restrict network access