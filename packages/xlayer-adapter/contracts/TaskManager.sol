// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TaskManager
 * @notice Manages workflow task lifecycle on X Layer
 * @dev Integrates with Charlie's 8004 Agent Registry
 * @dev TaskManager focuses on workflow orchestration, not Agent registration
 */

contract TaskManager {
    // ============ Types ============
    
    enum TaskStatus {
        Created,
        PendingConfirmation,    // Human-in-the-loop waiting
        Executing,
        Completed,
        Failed,
        Cancelled,
        Timeout
    }
    
    enum StepStatus {
        Pending,
        Success,
        Failed,
        Skipped
    }
    
    struct StepResult {
        bytes32 stepId;
        StepStatus status;
        bytes32 outputHash;     // Hash of output data (stored off-chain)
        string error;
        uint256 startedAt;
        uint256 completedAt;
    }
    
    struct Task {
        uint256 id;
        address requester;
        bytes32 workflowHash;   // IPFS/Arweave hash of workflow definition
        bytes32[] agentDIDs;    // List of 8004 Agent DIDs in workflow
        uint256 totalBudget;    // Total USDC budget
        TaskStatus status;
        uint256 currentStepIndex;
        StepResult[] stepResults;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 completedAt;
    }
    
    struct ConfirmationRequest {
        bytes32 id;
        uint256 taskId;
        bytes32 stepId;
        string title;
        string description;
        uint256 timeoutAt;
        bool confirmed;
        bool responded;
    }
    
    // ============ State ============
    
    mapping(uint256 => Task) public tasks;
    mapping(address => uint256[]) public requesterTasks;
    mapping(bytes32 => ConfirmationRequest) public confirmations;
    
    uint256 public nextTaskId = 1;
    
    // 8004 Agent Registry interface (Charlie's deployed contract)
    address public agentRegistry8004;
    address public paymentHub;
    address public owner;
    
    // ============ Events ============
    
    event TaskCreated(
        uint256 indexed taskId,
        address indexed requester,
        bytes32 workflowHash,
        uint256 budget
    );
    
    event TaskStatusChanged(
        uint256 indexed taskId,
        TaskStatus oldStatus,
        TaskStatus newStatus
    );
    
    event StepCompleted(
        uint256 indexed taskId,
        bytes32 indexed stepId,
        StepStatus status
    );
    
    event ConfirmationRequested(
        bytes32 indexed confirmationId,
        uint256 indexed taskId,
        bytes32 stepId,
        uint256 timeoutAt
    );
    
    event ConfirmationResponded(
        bytes32 indexed confirmationId,
        bool confirmed
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyPaymentHub() {
        require(msg.sender == paymentHub, "Not payment hub");
        _;
    }
    
    modifier validTask(uint256 taskId) {
        require(tasks[taskId].id != 0, "Task not found");
        _;
    }
    
    modifier onlyRequester(uint256 taskId) {
        require(tasks[taskId].requester == msg.sender, "Not task requester");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _agentRegistry8004) {
        owner = msg.sender;
        agentRegistry8004 = _agentRegistry8004;
    }
    
    // ============ Admin Functions ============
    
    function setPaymentHub(address _paymentHub) external onlyOwner {
        paymentHub = _paymentHub;
    }
    
    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        agentRegistry8004 = _agentRegistry;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create a new task
     * @param workflowHash IPFS/Arweave hash of workflow definition
     * @param agentDIDs List of 8004 Agent DIDs required for workflow
     * @param totalBudget Total USDC budget for task
     * @dev Agent validation is done off-chain via 8004 registry
     */
    function createTask(
        bytes32 workflowHash,
        bytes32[] calldata agentDIDs,
        uint256 totalBudget
    ) external returns (uint256) {
        require(workflowHash != bytes32(0), "Workflow hash required");
        require(agentDIDs.length > 0, "At least one agent required");
        require(totalBudget > 0, "Budget must be greater than 0");
        
        // Note: Agent validation (existence, active status) is done off-chain
        // via 8004 registry (Charlie's integration) before calling this function
        
        uint256 taskId = nextTaskId++;
        
        Task storage task = tasks[taskId];
        task.id = taskId;
        task.requester = msg.sender;
        task.workflowHash = workflowHash;
        task.agentDIDs = agentDIDs;
        task.totalBudget = totalBudget;
        task.status = TaskStatus.Created;
        task.currentStepIndex = 0;
        task.createdAt = block.timestamp;
        task.updatedAt = block.timestamp;
        
        requesterTasks[msg.sender].push(taskId);
        
        emit TaskCreated(taskId, msg.sender, workflowHash, totalBudget);
        
        return taskId;
    }
    
    /**
     * @notice Start task execution
     * Called by orchestrator after payment escrow
     */
    function startExecution(uint256 taskId) 
        external 
        onlyPaymentHub 
        validTask(taskId) 
    {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Created, "Invalid status");
        
        TaskStatus oldStatus = task.status;
        task.status = TaskStatus.Executing;
        task.updatedAt = block.timestamp;
        
        emit TaskStatusChanged(taskId, oldStatus, TaskStatus.Executing);
    }
    
    /**
     * @notice Request human confirmation (human-in-the-loop)
     */
    function requestConfirmation(
        uint256 taskId,
        bytes32 stepId,
        string calldata title,
        string calldata description,
        uint256 timeoutSeconds
    ) external validTask(taskId) returns (bytes32) {
        // In production, verify caller is authorized orchestrator
        
        bytes32 confirmationId = keccak256(abi.encodePacked(
            taskId,
            stepId,
            block.timestamp,
            msg.sender
        ));
        
        confirmations[confirmationId] = ConfirmationRequest({
            id: confirmationId,
            taskId: taskId,
            stepId: stepId,
            title: title,
            description: description,
            timeoutAt: block.timestamp + timeoutSeconds,
            confirmed: false,
            responded: false
        });
        
        Task storage task = tasks[taskId];
        TaskStatus oldStatus = task.status;
        task.status = TaskStatus.PendingConfirmation;
        task.updatedAt = block.timestamp;
        
        emit ConfirmationRequested(confirmationId, taskId, stepId, block.timestamp + timeoutSeconds);
        emit TaskStatusChanged(taskId, oldStatus, TaskStatus.PendingConfirmation);
        
        return confirmationId;
    }
    
    /**
     * @notice Respond to confirmation request
     */
    function respondToConfirmation(
        bytes32 confirmationId,
        bool confirm
    ) external {
        ConfirmationRequest storage req = confirmations[confirmationId];
        require(req.id != bytes32(0), "Confirmation not found");
        require(!req.responded, "Already responded");
        require(block.timestamp < req.timeoutAt, "Confirmation timeout");
        
        Task storage task = tasks[req.taskId];
        require(task.requester == msg.sender, "Not task requester");
        
        req.responded = true;
        req.confirmed = confirm;
        
        TaskStatus oldStatus = task.status;
        
        if (confirm) {
            task.status = TaskStatus.Executing;
        } else {
            task.status = TaskStatus.Cancelled;
            task.completedAt = block.timestamp;
        }
        
        task.updatedAt = block.timestamp;
        
        emit ConfirmationResponded(confirmationId, confirm);
        emit TaskStatusChanged(req.taskId, oldStatus, task.status);
    }
    
    /**
     * @notice Record step completion
     */
    function recordStepCompletion(
        uint256 taskId,
        bytes32 stepId,
        StepStatus status,
        bytes32 outputHash,
        string calldata error
    ) external validTask(taskId) {
        // In production, verify caller is authorized orchestrator
        
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Executing, "Task not executing");
        
        StepResult memory result = StepResult({
            stepId: stepId,
            status: status,
            outputHash: outputHash,
            error: error,
            startedAt: block.timestamp, // Simplified
            completedAt: block.timestamp
        });
        
        task.stepResults.push(result);
        task.currentStepIndex++;
        task.updatedAt = block.timestamp;
        
        emit StepCompleted(taskId, stepId, status);
        
        // Auto-complete if all steps done
        if (task.currentStepIndex >= task.agentDIDs.length) {
            _completeTask(taskId, status != StepStatus.Failed);
        }
    }
    
    /**
     * @notice Complete task
     */
    function _completeTask(uint256 taskId, bool success) internal {
        Task storage task = tasks[taskId];
        TaskStatus oldStatus = task.status;
        
        task.status = success ? TaskStatus.Completed : TaskStatus.Failed;
        task.completedAt = block.timestamp;
        task.updatedAt = block.timestamp;
        
        emit TaskStatusChanged(taskId, oldStatus, task.status);
    }
    
    /**
     * @notice Cancel task (only by requester before completion)
     */
    function cancelTask(uint256 taskId) 
        external 
        validTask(taskId) 
        onlyRequester(taskId) 
    {
        Task storage task = tasks[taskId];
        require(
            task.status != TaskStatus.Completed && 
            task.status != TaskStatus.Failed &&
            task.status != TaskStatus.Cancelled,
            "Task already finished"
        );
        
        TaskStatus oldStatus = task.status;
        task.status = TaskStatus.Cancelled;
        task.completedAt = block.timestamp;
        task.updatedAt = block.timestamp;
        
        emit TaskStatusChanged(taskId, oldStatus, TaskStatus.Cancelled);
    }
    
    /**
     * @notice Handle timeout (called by external keeper)
     */
    function handleTimeout(uint256 taskId) external validTask(taskId) {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.PendingConfirmation, "Not waiting for confirmation");
        
        TaskStatus oldStatus = task.status;
        task.status = TaskStatus.Timeout;
        task.completedAt = block.timestamp;
        task.updatedAt = block.timestamp;
        
        emit TaskStatusChanged(taskId, oldStatus, TaskStatus.Timeout);
    }
    
    // ============ View Functions ============
    
    function getTask(uint256 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }
    
    function getRequesterTasks(address requester) external view returns (uint256[] memory) {
        return requesterTasks[requester];
    }
    
    function getConfirmation(bytes32 confirmationId) external view returns (ConfirmationRequest memory) {
        return confirmations[confirmationId];
    }
    
    function getStepResults(uint256 taskId) external view validTask(taskId) returns (StepResult[] memory) {
        return tasks[taskId].stepResults;
    }
    
    /**
     * @notice Get 8004 Agent Registry address
     */
    function getAgentRegistry() external view returns (address) {
        return agentRegistry8004;
    }
}