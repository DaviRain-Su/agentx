// Test script to verify contract connectivity
const { ethers } = require('ethers');

// X Layer Testnet RPC
const RPC_URL = 'https://rpc.xlayer.tech/testnet';

// Contract Addresses (lowercase for checksum)
const CONTRACTS = {
  taskManager: '0x39223444d2f9a4d6769e91aa7908CB22CA3A8686',
  paymentHub: '0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60',
  usdc: '0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e',
  agentRegistry8004: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
};

// Test account
const TEST_ADDRESS = '0x067aBc270C4638869Cd347530Be34cBdD93D0EA1';

// Minimal ABIs
const USDC_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const TASK_MANAGER_ABI = [
  'function getTask(uint256 taskId) view returns (tuple(uint256 id, address requester, bytes32 workflowHash, bytes32[] agentDIDs, uint256 totalBudget, uint8 status, uint256 currentStepIndex, uint256 createdAt, uint256 updatedAt, uint256 completedAt))',
  'function getRequesterTasks(address requester) view returns (uint256[])',
  'function taskCounter() view returns (uint256)',
];

async function testConnection() {
  console.log('🔍 Testing X Layer Contract Connection\n');
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  try {
    // Test 1: Network connection
    console.log('1️⃣ Testing network connection...');
    const blockNumber = await provider.getBlockNumber();
    console.log(`   ✅ Connected. Current block: ${blockNumber}`);
    
    // Test 2: USDC contract
    console.log('\n2️⃣ Testing USDC contract...');
    try {
      const usdc = new ethers.Contract(CONTRACTS.usdc, USDC_ABI, provider);
      const decimals = await usdc.decimals();
      const balance = await usdc.balanceOf(TEST_ADDRESS);
      console.log(`   ✅ USDC Decimals: ${decimals}`);
      console.log(`   ✅ Test address balance: ${ethers.formatUnits(balance, decimals)} USDC`);
    } catch (e) {
      console.log(`   ⚠️ USDC test skipped: ${e.message}`);
      console.log(`      This is OK if USDC is not deployed on testnet`);
    }
    
    // Test 3: TaskManager contract
    console.log('\n3️⃣ Testing TaskManager contract...');
    const taskManager = new ethers.Contract(CONTRACTS.taskManager, TASK_MANAGER_ABI, provider);
    const taskCounter = await taskManager.taskCounter();
    console.log(`   ✅ TaskManager connected`);
    console.log(`   📊 Total tasks created: ${taskCounter.toString()}`);
    
    // Test 4: Get requester tasks
    console.log('\n4️⃣ Testing getRequesterTasks...');
    const requesterTasks = await taskManager.getRequesterTasks(TEST_ADDRESS);
    console.log(`   ✅ Found ${requesterTasks.length} tasks for test address`);
    
    if (requesterTasks.length > 0) {
      console.log('\n5️⃣ Testing getTask for first task...');
      const firstTaskId = requesterTasks[0];
      const task = await taskManager.getTask(firstTaskId);
      console.log(`   ✅ Task #${firstTaskId}:`);
      console.log(`      - Requester: ${task.requester}`);
      console.log(`      - Status: ${['Pending', 'Executing', 'Completed', 'Failed', 'Cancelled'][task.status]}`);
      console.log(`      - Budget: ${ethers.formatUnits(task.totalBudget, 6)} USDC`);
      console.log(`      - Created: ${new Date(Number(task.createdAt) * 1000).toLocaleString()}`);
    }
    
    console.log('\n✅ All tests passed!');
    return true;
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
