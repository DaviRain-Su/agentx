// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PaymentHub
 * @notice Manages escrow payments for Gradience tasks on X Layer
 * @dev Handles USDC escrow, release, and refunds
 */

contract PaymentHub is ReentrancyGuard {
    // ============ Types ============
    
    enum EscrowStatus {
        Pending,
        Escrowed,
        Released,
        Refunded,
        Disputed
    }
    
    struct Escrow {
        bytes32 id;
        uint256 taskId;
        address requester;
        uint256 totalAmount;
        mapping(address => uint256) agentPayments; // Agent owner => amount
        address[] agents;
        EscrowStatus status;
        uint256 createdAt;
        uint256 releasedAt;
    }
    
    struct PaymentBreakdown {
        address agentOwner;
        uint256 amount;
        string description;
    }
    
    // ============ State ============
    
    mapping(bytes32 => Escrow) public escrows;
    mapping(uint256 => bytes32) public taskEscrow;
    
    IERC20 public usdc;
    address public taskManager;
    address public owner;
    address public feeRecipient;
    uint256 public platformFeeBps = 1000; // 10% in basis points (10000 = 100%)
    
    uint256 public constant MIN_ESCROW = 1e6; // 1 USDC (6 decimals)
    uint256 public constant MAX_ESCROW = 100000e6; // 100,000 USDC
    
    // ============ Events ============
    
    event EscrowCreated(
        bytes32 indexed escrowId,
        uint256 indexed taskId,
        address indexed requester,
        uint256 amount
    );
    
    event EscrowReleased(
        bytes32 indexed escrowId,
        uint256 indexed taskId,
        uint256 totalAmount
    );
    
    event EscrowRefunded(
        bytes32 indexed escrowId,
        uint256 indexed taskId,
        uint256 refundAmount
    );
    
    event AgentPaid(
        bytes32 indexed escrowId,
        address indexed agentOwner,
        uint256 amount
    );
    
    event FeeCollected(
        bytes32 indexed escrowId,
        uint256 amount
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyTaskManager() {
        require(msg.sender == taskManager, "Not task manager");
        _;
    }
    
    modifier validEscrow(bytes32 escrowId) {
        require(escrows[escrowId].id != bytes32(0), "Escrow not found");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _usdc, address _feeRecipient) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
    }
    
    // ============ Admin Functions ============
    
    function setTaskManager(address _taskManager) external onlyOwner {
        taskManager = _taskManager;
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }
    
    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 3000, "Fee cannot exceed 30%");
        platformFeeBps = _feeBps;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create escrow for a task
     * @param taskId Task ID from TaskManager
     * @param amount Total USDC amount to escrow
     * @param breakdown Payment breakdown for each agent
     */
    function createEscrow(
        uint256 taskId,
        uint256 amount,
        PaymentBreakdown[] calldata breakdown
    ) external nonReentrant returns (bytes32) {
        require(amount >= MIN_ESCROW, "Amount below minimum");
        require(amount <= MAX_ESCROW, "Amount above maximum");
        require(breakdown.length > 0, "Breakdown required");
        require(taskEscrow[taskId] == bytes32(0), "Escrow already exists for task");
        
        // Verify breakdown sums to amount
        uint256 totalBreakdown = 0;
        for (uint i = 0; i < breakdown.length; i++) {
            totalBreakdown += breakdown[i].amount;
        }
        require(totalBreakdown == amount, "Breakdown sum mismatch");
        
        // Generate escrow ID
        bytes32 escrowId = keccak256(abi.encodePacked(
            taskId,
            msg.sender,
            amount,
            block.timestamp
        ));
        
        // Create escrow
        Escrow storage escrow = escrows[escrowId];
        escrow.id = escrowId;
        escrow.taskId = taskId;
        escrow.requester = msg.sender;
        escrow.totalAmount = amount;
        escrow.status = EscrowStatus.Pending;
        escrow.createdAt = block.timestamp;
        
        // Store agent payments
        for (uint i = 0; i < breakdown.length; i++) {
            escrow.agentPayments[breakdown[i].agentOwner] = breakdown[i].amount;
            escrow.agents.push(breakdown[i].agentOwner);
        }
        
        taskEscrow[taskId] = escrowId;
        
        // Transfer USDC from requester
        require(
            usdc.transferFrom(msg.sender, address(this), amount),
            "USDC transfer failed"
        );
        
        escrow.status = EscrowStatus.Escrowed;
        
        emit EscrowCreated(escrowId, taskId, msg.sender, amount);
        
        return escrowId;
    }
    
    /**
     * @notice Release escrow to agents (called by TaskManager on success)
     */
    function releaseEscrow(bytes32 escrowId) 
        external 
        onlyTaskManager 
        validEscrow(escrowId) 
        nonReentrant 
    {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Escrowed, "Invalid escrow status");
        
        escrow.status = EscrowStatus.Released;
        escrow.releasedAt = block.timestamp;
        
        uint256 totalAmount = escrow.totalAmount;
        uint256 platformFee = (totalAmount * platformFeeBps) / 10000;
        uint256 distributableAmount = totalAmount - platformFee;
        
        // Transfer platform fee
        if (platformFee > 0 && feeRecipient != address(0)) {
            require(usdc.transfer(feeRecipient, platformFee), "Fee transfer failed");
            emit FeeCollected(escrowId, platformFee);
        }
        
        // Distribute to agents
        for (uint i = 0; i < escrow.agents.length; i++) {
            address agentOwner = escrow.agents[i];
            uint256 agentAmount = escrow.agentPayments[agentOwner];
            
            // Calculate proportion of distributable amount
            uint256 agentShare = (agentAmount * distributableAmount) / totalAmount;
            
            if (agentShare > 0) {
                require(usdc.transfer(agentOwner, agentShare), "Agent payment failed");
                emit AgentPaid(escrowId, agentOwner, agentShare);
            }
        }
        
        emit EscrowReleased(escrowId, escrow.taskId, totalAmount);
    }
    
    /**
     * @notice Refund escrow to requester (called by TaskManager on failure/cancel)
     */
    function refundEscrow(bytes32 escrowId) 
        external 
        onlyTaskManager 
        validEscrow(escrowId) 
        nonReentrant 
    {
        Escrow storage escrow = escrows[escrowId];
        require(
            escrow.status == EscrowStatus.Escrowed || escrow.status == EscrowStatus.Pending,
            "Cannot refund"
        );
        
        escrow.status = EscrowStatus.Refunded;
        escrow.releasedAt = block.timestamp;
        
        uint256 refundAmount = escrow.totalAmount;
        
        require(
            usdc.transfer(escrow.requester, refundAmount),
            "Refund transfer failed"
        );
        
        emit EscrowRefunded(escrowId, escrow.taskId, refundAmount);
    }
    
    /**
     * @notice Partial release (for partial completion)
     * @param completedSteps Number of steps completed
     * @param totalSteps Total number of steps
     */
    function partialRelease(
        bytes32 escrowId,
        uint256 completedSteps,
        uint256 totalSteps
    ) external onlyTaskManager validEscrow(escrowId) nonReentrant {
        require(completedSteps < totalSteps, "Use full release");
        require(completedSteps > 0, "No steps completed");
        
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Escrowed, "Invalid escrow status");
        
        escrow.status = EscrowStatus.Released;
        escrow.releasedAt = block.timestamp;
        
        uint256 totalAmount = escrow.totalAmount;
        uint256 completionRate = (completedSteps * 10000) / totalSteps;
        uint256 releaseAmount = (totalAmount * completionRate) / 10000;
        uint256 refundAmount = totalAmount - releaseAmount;
        
        uint256 platformFee = (releaseAmount * platformFeeBps) / 10000;
        uint256 distributableAmount = releaseAmount - platformFee;
        
        // Transfer platform fee
        if (platformFee > 0 && feeRecipient != address(0)) {
            require(usdc.transfer(feeRecipient, platformFee), "Fee transfer failed");
        }
        
        // Distribute to agents proportionally
        for (uint i = 0; i < escrow.agents.length; i++) {
            address agentOwner = escrow.agents[i];
            uint256 agentAmount = escrow.agentPayments[agentOwner];
            uint256 agentShare = (agentAmount * distributableAmount) / totalAmount;
            
            if (agentShare > 0) {
                require(usdc.transfer(agentOwner, agentShare), "Agent payment failed");
                emit AgentPaid(escrowId, agentOwner, agentShare);
            }
        }
        
        // Refund remaining to requester
        if (refundAmount > 0) {
            require(usdc.transfer(escrow.requester, refundAmount), "Refund transfer failed");
        }
        
        emit EscrowReleased(escrowId, escrow.taskId, releaseAmount);
        emit EscrowRefunded(escrowId, escrow.taskId, refundAmount);
    }
    
    // ============ View Functions ============
    
    function getEscrow(bytes32 escrowId) external view returns (
        bytes32 id,
        uint256 taskId,
        address requester,
        uint256 totalAmount,
        EscrowStatus status,
        uint256 createdAt
    ) {
        Escrow storage escrow = escrows[escrowId];
        return (
            escrow.id,
            escrow.taskId,
            escrow.requester,
            escrow.totalAmount,
            escrow.status,
            escrow.createdAt
        );
    }
    
    function getAgentPayment(bytes32 escrowId, address agentOwner) 
        external 
        view 
        validEscrow(escrowId) 
        returns (uint256) 
    {
        return escrows[escrowId].agentPayments[agentOwner];
    }
    
    function getEscrowAgents(bytes32 escrowId) 
        external 
        view 
        validEscrow(escrowId) 
        returns (address[] memory) 
    {
        return escrows[escrowId].agents;
    }
    
    function calculateFee(uint256 amount) external view returns (uint256 fee, uint256 netAmount) {
        fee = (amount * platformFeeBps) / 10000;
        netAmount = amount - fee;
    }
    
    // ============ Emergency Functions ============
    
    /**
     * @notice Emergency pause (only owner)
     */
    function emergencyPause() external onlyOwner {
        // In production, implement pause mechanism
    }
    
    /**
     * @notice Recover stuck tokens (only owner, for emergencies)
     */
    function recoverStuckTokens(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(token != address(usdc), "Cannot recover USDC");
        IERC20(token).transfer(to, amount);
    }
}