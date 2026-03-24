// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TeamRegistry
 * @notice Manages AI Agent teams for collaborative task execution
 * @dev Teams can be hired for specific durations with USDC payment
 */
contract TeamRegistry is ReentrancyGuard {
    // ============ Enums ============
    
    enum AgentRole {
        NONE,
        LEADER,
        SPECIALIST,
        EVALUATOR
    }
    
    enum TeamStatus {
        ACTIVE,
        PAUSED,
        DISBANDED
    }
    
    // ============ Structs ============
    
    struct Team {
        bytes32 teamId;
        string name;
        string description;
        address creator;
        uint256 price;           // Price per hour in USDC (6 decimals)
        uint256 minDuration;     // Minimum hire duration in seconds
        bytes32[] agentDIDs;     // Team member DIDs
        mapping(bytes32 => AgentRole) agentRoles;
        TeamStatus status;
        uint256 totalHires;
        uint256 totalRevenue;
        uint256 ratingSum;       // Sum of all ratings
        uint256 ratingCount;     // Number of ratings
        uint256 createdAt;
    }
    
    struct TeamView {
        bytes32 teamId;
        string name;
        string description;
        address creator;
        uint256 price;
        uint256 minDuration;
        bytes32[] agentDIDs;
        TeamStatus status;
        uint256 totalHires;
        uint256 totalRevenue;
        uint256 averageRating;   // 0-500 (0-5 stars with 2 decimal places)
        uint256 createdAt;
    }
    
    struct HireSession {
        bytes32 sessionId;
        bytes32 teamId;
        address hirer;
        uint256 startTime;
        uint256 endTime;
        uint256 amount;          // Total amount paid
        uint256 amountReleased;  // Amount already released to team
        HireStatus status;
    }
    
    enum HireStatus {
        ACTIVE,
        COMPLETED,
        DISPUTED,
        REFUNDED
    }
    
    // ============ State ============
    
    mapping(bytes32 => Team) public teams;
    mapping(bytes32 => HireSession) public sessions;
    mapping(address => bytes32[]) public creatorTeams;
    mapping(address => bytes32[]) public hirerSessions;
    
    bytes32[] public allTeamIds;
    
    IERC20 public usdc;
    address public owner;
    address public teamPaymentHub;
    
    uint256 public constant MIN_PRICE = 1e6;        // 1 USDC per hour minimum
    uint256 public constant MAX_TEAM_SIZE = 10;     // Maximum 10 agents per team
    uint256 public constant PLATFORM_FEE_BPS = 500; // 5% platform fee
    
    // ============ Events ============
    
    event TeamCreated(
        bytes32 indexed teamId,
        string name,
        address indexed creator,
        uint256 price,
        bytes32[] agentDIDs
    );
    
    event TeamUpdated(
        bytes32 indexed teamId,
        uint256 newPrice,
        TeamStatus newStatus
    );
    
    event TeamDisbanded(bytes32 indexed teamId, uint256 timestamp);
    
    event TeamHired(
        bytes32 indexed sessionId,
        bytes32 indexed teamId,
        address indexed hirer,
        uint256 amount,
        uint256 duration
    );
    
    event SessionCompleted(
        bytes32 indexed sessionId,
        bytes32 indexed teamId,
        uint256 amountReleased
    );
    
    event SessionDisputed(
        bytes32 indexed sessionId,
        address indexed hirer,
        string reason
    );
    
    event TeamRated(
        bytes32 indexed teamId,
        bytes32 indexed sessionId,
        uint256 rating,
        string review
    );
    
    event PaymentReleased(
        bytes32 indexed sessionId,
        address indexed creator,
        uint256 amount
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyTeamCreator(bytes32 teamId) {
        require(teams[teamId].creator == msg.sender, "Not team creator");
        _;
    }
    
    modifier validTeam(bytes32 teamId) {
        require(teams[teamId].creator != address(0), "Team not found");
        require(teams[teamId].status != TeamStatus.DISBANDED, "Team disbanded");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _usdc) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
    }
    
    // ============ Admin Functions ============
    
    function setPaymentHub(address _paymentHub) external onlyOwner {
        teamPaymentHub = _paymentHub;
    }
    
    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 2000, "Fee max 20%");
        // PLATFORM_FEE_BPS = _feeBps; // Would need to make it non-constant
    }
    
    // ============ Team Management ============
    
    /**
     * @notice Create a new AI Agent team
     * @param name Team name
     * @param description Team description
     * @param price Price per hour in USDC (6 decimals)
     * @param minDuration Minimum hire duration in seconds
     * @param agentDIDs Array of agent DIDs
     * @param roles Array of roles corresponding to agents
     */
    function createTeam(
        string calldata name,
        string calldata description,
        uint256 price,
        uint256 minDuration,
        bytes32[] calldata agentDIDs,
        AgentRole[] calldata roles
    ) external returns (bytes32 teamId) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(name).length <= 100, "Name too long");
        require(price >= MIN_PRICE, "Price too low");
        require(agentDIDs.length > 0, "Need at least one agent");
        require(agentDIDs.length <= MAX_TEAM_SIZE, "Too many agents");
        require(agentDIDs.length == roles.length, "DIDs and roles length mismatch");
        
        // Generate team ID
        teamId = keccak256(abi.encodePacked(
            msg.sender,
            name,
            block.timestamp,
            agentDIDs
        ));
        
        require(teams[teamId].creator == address(0), "Team already exists");
        
        // Create team
        Team storage team = teams[teamId];
        team.teamId = teamId;
        team.name = name;
        team.description = description;
        team.creator = msg.sender;
        team.price = price;
        team.minDuration = minDuration;
        team.status = TeamStatus.ACTIVE;
        team.createdAt = block.timestamp;
        
        // Add agents and roles
        for (uint i = 0; i < agentDIDs.length; i++) {
            team.agentDIDs.push(agentDIDs[i]);
            team.agentRoles[agentDIDs[i]] = roles[i];
        }
        
        // Track creator's teams
        creatorTeams[msg.sender].push(teamId);
        allTeamIds.push(teamId);
        
        emit TeamCreated(teamId, name, msg.sender, price, agentDIDs);
        
        return teamId;
    }
    
    /**
     * @notice Update team price or status
     */
    function updateTeam(
        bytes32 teamId,
        uint256 newPrice,
        TeamStatus newStatus
    ) external onlyTeamCreator(teamId) validTeam(teamId) {
        if (newPrice > 0) {
            require(newPrice >= MIN_PRICE, "Price too low");
            teams[teamId].price = newPrice;
        }
        
        teams[teamId].status = newStatus;
        
        emit TeamUpdated(teamId, newPrice, newStatus);
    }
    
    /**
     * @notice Disband a team (permanent)
     */
    function disbandTeam(bytes32 teamId) external onlyTeamCreator(teamId) {
        require(teams[teamId].status != TeamStatus.DISBANDED, "Already disbanded");
        teams[teamId].status = TeamStatus.DISBANDED;
        
        emit TeamDisbanded(teamId, block.timestamp);
    }
    
    // ============ Hiring Functions ============
    
    /**
     * @notice Hire a team for a specific duration
     * @param teamId Team to hire
     * @param duration Hire duration in seconds
     */
    function hireTeam(
        bytes32 teamId,
        uint256 duration
    ) external nonReentrant validTeam(teamId) returns (bytes32 sessionId) {
        Team storage team = teams[teamId];
        require(team.status == TeamStatus.ACTIVE, "Team not active");
        require(duration >= team.minDuration, "Duration too short");
        
        // Calculate cost (price is per hour, convert to per second)
        uint256 cost = (team.price * duration) / 3600;
        require(cost > 0, "Cost too low");
        
        // Transfer USDC from hirer
        require(
            usdc.transferFrom(msg.sender, address(this), cost),
            "Payment failed"
        );
        
        // Generate session ID
        sessionId = keccak256(abi.encodePacked(
            teamId,
            msg.sender,
            block.timestamp
        ));
        
        // Create session
        HireSession storage session = sessions[sessionId];
        session.sessionId = sessionId;
        session.teamId = teamId;
        session.hirer = msg.sender;
        session.startTime = block.timestamp;
        session.endTime = block.timestamp + duration;
        session.amount = cost;
        session.status = HireStatus.ACTIVE;
        
        // Track
        hirerSessions[msg.sender].push(sessionId);
        team.totalHires++;
        
        emit TeamHired(sessionId, teamId, msg.sender, cost, duration);
        
        return sessionId;
    }
    
    /**
     * @notice Complete a hire session and release payment
     */
    function completeSession(bytes32 sessionId) external nonReentrant {
        HireSession storage session = sessions[sessionId];
        require(session.hirer != address(0), "Session not found");
        require(session.status == HireStatus.ACTIVE, "Session not active");
        require(
            msg.sender == session.hirer || block.timestamp >= session.endTime,
            "Only hirer can complete early"
        );
        
        session.status = HireStatus.COMPLETED;
        
        // Calculate amount to release (pro-rata if early completion)
        uint256 durationUsed = block.timestamp - session.startTime;
        uint256 totalDuration = session.endTime - session.startTime;
        uint256 amountToRelease = (session.amount * durationUsed) / totalDuration;
        
        // Apply platform fee
        uint256 platformFee = (amountToRelease * PLATFORM_FEE_BPS) / 10000;
        uint256 creatorAmount = amountToRelease - platformFee;
        
        // Update tracking
        session.amountReleased = amountToRelease;
        teams[session.teamId].totalRevenue += creatorAmount;
        
        // Transfer to team creator
        Team storage team = teams[session.teamId];
        require(
            usdc.transfer(team.creator, creatorAmount),
            "Creator payment failed"
        );
        
        // Refund unused amount to hirer
        uint256 refund = session.amount - amountToRelease;
        if (refund > 0) {
            require(
                usdc.transfer(session.hirer, refund),
                "Refund failed"
            );
        }
        
        emit SessionCompleted(sessionId, session.teamId, amountToRelease);
        emit PaymentReleased(sessionId, team.creator, creatorAmount);
    }
    
    /**
     * @notice Rate a team after session completion
     */
    function rateTeam(
        bytes32 teamId,
        bytes32 sessionId,
        uint256 rating,
        string calldata review
    ) external {
        require(rating <= 500, "Rating max 500 (5 stars)");
        require(sessions[sessionId].hirer == msg.sender, "Only hirer can rate");
        require(sessions[sessionId].status == HireStatus.COMPLETED, "Session not completed");
        
        Team storage team = teams[teamId];
        team.ratingSum += rating;
        team.ratingCount++;
        
        emit TeamRated(teamId, sessionId, rating, review);
    }
    
    // ============ View Functions ============
    
    function getTeam(bytes32 teamId) external view returns (TeamView memory) {
        Team storage team = teams[teamId];
        require(team.creator != address(0), "Team not found");
        
        uint256 avgRating = team.ratingCount > 0 
            ? team.ratingSum / team.ratingCount 
            : 0;
        
        return TeamView({
            teamId: team.teamId,
            name: team.name,
            description: team.description,
            creator: team.creator,
            price: team.price,
            minDuration: team.minDuration,
            agentDIDs: team.agentDIDs,
            status: team.status,
            totalHires: team.totalHires,
            totalRevenue: team.totalRevenue,
            averageRating: avgRating,
            createdAt: team.createdAt
        });
    }
    
    function getTeamMembers(bytes32 teamId) external view returns (
        bytes32[] memory agentDIDs,
        AgentRole[] memory roles
    ) {
        Team storage team = teams[teamId];
        agentDIDs = team.agentDIDs;
        roles = new AgentRole[](agentDIDs.length);
        
        for (uint i = 0; i < agentDIDs.length; i++) {
            roles[i] = team.agentRoles[agentDIDs[i]];
        }
        
        return (agentDIDs, roles);
    }
    
    function getCreatorTeams(address creator) external view returns (bytes32[] memory) {
        return creatorTeams[creator];
    }
    
    function getHirerSessions(address hirer) external view returns (bytes32[] memory) {
        return hirerSessions[hirer];
    }
    
    function getAllActiveTeams() external view returns (bytes32[] memory) {
        uint256 activeCount = 0;
        for (uint i = 0; i < allTeamIds.length; i++) {
            if (teams[allTeamIds[i]].status == TeamStatus.ACTIVE) {
                activeCount++;
            }
        }
        
        bytes32[] memory activeTeams = new bytes32[](activeCount);
        uint256 index = 0;
        for (uint i = 0; i < allTeamIds.length; i++) {
            if (teams[allTeamIds[i]].status == TeamStatus.ACTIVE) {
                activeTeams[index++] = allTeamIds[i];
            }
        }
        
        return activeTeams;
    }
    
    // ============ Emergency Functions ============
    
    function emergencyRefund(bytes32 sessionId) external onlyOwner {
        HireSession storage session = sessions[sessionId];
        require(session.status == HireStatus.DISPUTED, "Not disputed");
        
        session.status = HireStatus.REFUNDED;
        require(
            usdc.transfer(session.hirer, session.amount),
            "Refund failed"
        );
    }
    
    function recoverStuckTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(usdc), "Cannot recover USDC");
        IERC20(token).transfer(owner, amount);
    }
}
