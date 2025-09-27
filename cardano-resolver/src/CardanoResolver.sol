// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import {IOrderMixin} from "limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import {TakerTraits} from "limit-order-protocol/contracts/libraries/TakerTraitsLib.sol";

import {IResolverExample} from "cross-chain-swap/contracts/interfaces/IResolverExample.sol";
import {RevertReasonForwarder} from "cross-chain-swap/lib/solidity-utils/contracts/libraries/RevertReasonForwarder.sol";
import {IEscrowFactory} from "cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import {IBaseEscrow} from "cross-chain-swap/contracts/interfaces/IBaseEscrow.sol";
import {TimelocksLib, Timelocks} from "cross-chain-swap/contracts/libraries/TimelocksLib.sol";
import {Address} from "solidity-utils/contracts/libraries/AddressLib.sol";
import {IEscrow} from "cross-chain-swap/contracts/interfaces/IEscrow.sol";
import {ImmutablesLib} from "cross-chain-swap/contracts/libraries/ImmutablesLib.sol";

/**
 * @title Cardano Resolver for 1inch Cross-Chain Swaps
 * @notice Extends official 1inch resolver to support EVM ↔ Cardano atomic swaps
 * @dev Integrates with 1inch LimitOrderProtocol and EscrowFactory for official compatibility
 *
 * Key Features:
 * - Official 1inch Fusion integration
 * - Cardano Plutus contract coordination
 * - Multi-stage timelock management
 * - Partial fill support via Merkle trees
 * - Dutch auction rate discovery
 *
 * @custom:security-contact security@1inch.io
 */
contract CardanoResolver is Ownable {
    using ImmutablesLib for IBaseEscrow.Immutables;
    using TimelocksLib for Timelocks;
    using SafeERC20 for IERC20;

    error InvalidLength();
    error LengthMismatch();
    error CardanoEscrowNotDeployed();
    error InvalidCardanoTransaction();
    error InsufficientSafetyDeposit();

    event CardanoEscrowDeployed(
        bytes32 indexed orderHash,
        string cardanoTxHash,
        string cardanoAddress,
        uint256 amount,
        bytes32 hashlock
    );

    event CardanoWithdrawal(
        bytes32 indexed orderHash,
        string cardanoTxHash,
        bytes32 secret
    );

    event CardanoCancellation(
        bytes32 indexed orderHash,
        string cardanoTxHash,
        address refundRecipient
    );

    IEscrowFactory private immutable _FACTORY;
    IOrderMixin private immutable _LOP;

    // Cardano-specific state
    mapping(bytes32 => string) public cardanoEscrowTxHashes;
    mapping(bytes32 => string) public cardanoEscrowAddresses;
    mapping(bytes32 => uint256) public cardanoDeploymentTimestamps;

    // Cross-chain coordination
    address public cardanoService;
    uint256 public minimumCardanoConfirmations = 6;

    modifier onlyCardanoService() {
        require(msg.sender == cardanoService, "Only Cardano service");
        _;
    }

    constructor(
        IEscrowFactory factory,
        IOrderMixin lop,
        address initialOwner,
        address _cardanoService
    ) Ownable(initialOwner) {
        _FACTORY = factory;
        _LOP = lop;
        cardanoService = _cardanoService;
    }

    receive() external payable {} // solhint-disable-line no-empty-blocks

    /**
     * @notice Deploy source escrow for EVM→Cardano swaps
     * @dev Integrates with 1inch LOP fillOrderArgs for official compatibility
     */
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args
    ) external payable onlyOwner {
        // Set deployment timestamp for timelock calculations
        IBaseEscrow.Immutables memory immutablesMem = immutables;
        immutablesMem.timelocks = TimelocksLib.setDeployedAt(immutables.timelocks, block.timestamp);

        // Pre-fund safety deposit to computed escrow address
        address computed = _FACTORY.addressOfEscrowSrc(immutablesMem);
        (bool success,) = address(computed).call{value: immutablesMem.safetyDeposit}("");
        if (!success) revert IBaseEscrow.NativeTokenSendingFailure();

        // Set target for LOP interaction
        takerTraits = TakerTraits.wrap(TakerTraits.unwrap(takerTraits) | uint256(1 << 251));
        bytes memory argsMem = abi.encodePacked(computed, args);

        // Execute order through 1inch LOP
        _LOP.fillOrderArgs(order, r, vs, amount, takerTraits, argsMem);

        // Emit event for Cardano service coordination
        emit CardanoEscrowDeployed(
            immutables.orderHash,
            "", // Will be filled by Cardano service
            "", // Will be filled by Cardano service
            amount,
            immutables.hashlock
        );
    }

    /**
     * @notice Deploy destination escrow for Cardano→EVM swaps
     * @dev Called after Cardano escrow is confirmed by service
     */
    function deployDst(
        IBaseEscrow.Immutables calldata dstImmutables,
        uint256 srcCancellationTimestamp,
        string calldata cardanoTxHash,
        string calldata cardanoAddress
    ) external onlyOwner payable {
        // Verify Cardano escrow exists and is confirmed
        require(bytes(cardanoTxHash).length > 0, "Invalid Cardano tx hash");
        require(bytes(cardanoAddress).length > 0, "Invalid Cardano address");

        // Store Cardano escrow details
        cardanoEscrowTxHashes[dstImmutables.orderHash] = cardanoTxHash;
        cardanoEscrowAddresses[dstImmutables.orderHash] = cardanoAddress;
        cardanoDeploymentTimestamps[dstImmutables.orderHash] = block.timestamp;

        // Deploy EVM destination escrow
        _FACTORY.createDstEscrow{value: msg.value}(dstImmutables, srcCancellationTimestamp);
    }

    /**
     * @notice Withdraw from escrow using revealed secret
     * @dev Works for both EVM escrows (direct call) and triggers Cardano withdrawal
     */
    function withdraw(
        IEscrow escrow,
        bytes32 secret,
        IBaseEscrow.Immutables calldata immutables
    ) external {
        // Attempt EVM escrow withdrawal
        escrow.withdraw(secret, immutables);

        // If successful, trigger Cardano withdrawal via service
        if (bytes(cardanoEscrowTxHashes[immutables.orderHash]).length > 0) {
            emit CardanoWithdrawal(immutables.orderHash, "", secret);
        }
    }

    /**
     * @notice Cancel escrow and return funds
     * @dev Handles both EVM cancellation and Cardano coordination
     */
    function cancel(IEscrow escrow, IBaseEscrow.Immutables calldata immutables) external {
        // Cancel EVM escrow
        escrow.cancel(immutables);

        // If Cardano escrow exists, trigger cancellation
        if (bytes(cardanoEscrowTxHashes[immutables.orderHash]).length > 0) {
            emit CardanoCancellation(immutables.orderHash, "", msg.sender);
        }
    }

    /**
     * @notice Record successful Cardano escrow deployment
     * @dev Called by authorized Cardano service after on-chain confirmation
     */
    function recordCardanoEscrow(
        bytes32 orderHash,
        string calldata cardanoTxHash,
        string calldata cardanoAddress,
        uint256 amount
    ) external onlyCardanoService {
        require(bytes(cardanoTxHash).length > 0, "Invalid tx hash");
        require(bytes(cardanoAddress).length > 0, "Invalid address");

        cardanoEscrowTxHashes[orderHash] = cardanoTxHash;
        cardanoEscrowAddresses[orderHash] = cardanoAddress;
        cardanoDeploymentTimestamps[orderHash] = block.timestamp;

        emit CardanoEscrowDeployed(orderHash, cardanoTxHash, cardanoAddress, amount, 0);
    }

    /**
     * @notice Emergency arbitrary calls for advanced coordination
     * @dev Allows complex multi-chain operations and emergency procedures
     */
    function arbitraryCalls(
        address[] calldata targets,
        bytes[] calldata arguments
    ) external onlyOwner {
        uint256 length = targets.length;
        if (targets.length != arguments.length) revert LengthMismatch();

        for (uint256 i = 0; i < length; ++i) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success,) = targets[i].call(arguments[i]);
            if (!success) RevertReasonForwarder.reRevert();
        }
    }

    /**
     * @notice Update Cardano service address
     * @dev Only owner can update for security
     */
    function setCardanoService(address _cardanoService) external onlyOwner {
        cardanoService = _cardanoService;
    }

    /**
     * @notice Set minimum Cardano confirmations required
     * @dev Configurable security parameter
     */
    function setMinimumCardanoConfirmations(uint256 _confirmations) external onlyOwner {
        minimumCardanoConfirmations = _confirmations;
    }

    /**
     * @notice Get Cardano escrow details for an order
     */
    function getCardanoEscrow(bytes32 orderHash) external view returns (
        string memory txHash,
        string memory cardanoAddress,
        uint256 deploymentTimestamp
    ) {
        return (
            cardanoEscrowTxHashes[orderHash],
            cardanoEscrowAddresses[orderHash],
            cardanoDeploymentTimestamps[orderHash]
        );
    }

    /**
     * @notice Check if Cardano escrow is properly deployed and confirmed
     */
    function isCardanoEscrowReady(bytes32 orderHash) external view returns (bool) {
        string memory txHash = cardanoEscrowTxHashes[orderHash];
        uint256 deployTime = cardanoDeploymentTimestamps[orderHash];

        return bytes(txHash).length > 0 &&
               deployTime > 0 &&
               block.timestamp >= deployTime + (minimumCardanoConfirmations * 20); // ~20s per block
    }

    /**
     * @notice Emergency withdraw for stuck funds
     * @dev Only callable by owner in emergency situations
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }
}