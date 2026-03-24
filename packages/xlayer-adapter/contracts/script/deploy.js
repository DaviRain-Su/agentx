#!/usr/bin/env node

/**
 * Deploy Script for X Layer Testnet
 * Uses ethers.js - no Foundry required
 */

const { ethers } = require('ethers');
require('dotenv').config();

// X Layer Testnet Config
const X_LAYER_TESTNET = {
  rpcUrl: 'https://rpc.xlayer.tech/testnet',
  chainId: 195,
  name: 'X Layer Testnet'
};

// Contract Bytecodes (simplified - in production use compiled artifacts)
// These would be the actual compiled bytecode from solc
const TASK_MANAGER_BYTECODE = '0x...'; // TODO: Replace with actual compiled bytecode
const PAYMENT_HUB_BYTECODE = '0x...';  // TODO: Replace with actual compiled bytecode

// Contract ABIs (simplified)
const TASK_MANAGER_ABI = [
  "constructor(address _agentRegistry8004)",
  "function setPaymentHub(address _paymentHub)",
  "event TaskCreated(uint256 indexed taskId, address indexed requester, bytes32 workflowHash, uint256 budget)"
];

const PAYMENT_HUB_ABI = [
  "constructor(address _usdc, address _feeRecipient)",
  "function setTaskManager(address _taskManager)",
  "event EscrowCreated(bytes32 indexed escrowId, uint256 indexed taskId, address indexed requester, uint256 amount)"
];

async function main() {
  // Check private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || privateKey === 'your_private_key_here') {
    console.error('❌ Error: Please set PRIVATE_KEY in .env file');
    console.log('\nTo get your private key:');
    console.log('1. If you used "make create-wallet", check the output');
    console.log('2. If using MetaMask/OKX Wallet:');
    console.log('   - Open wallet');
    console.log('   - Go to Account Details');
    console.log('   - Export Private Key');
    console.log('\n⚠️  NEVER share your private key!');
    process.exit(1);
  }

  // Connect to X Layer Testnet
  console.log('🔗 Connecting to X Layer Testnet...');
  const provider = new ethers.JsonRpcProvider(X_LAYER_TESTNET.rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log('📍 Deployer Address:', wallet.address);
  
  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'OKB');
  
  if (balance === 0n) {
    console.error('❌ Error: No OKB balance. Get testnet OKB from:');
    console.log('   https://www.okx.com/xlayer/faucet');
    process.exit(1);
  }

  // Get addresses from env
  const usdcAddress = process.env.USDC_TESTNET_ADDRESS;
  const agentRegistry8004 = process.env.AGENT_REGISTRY_8004;
  
  console.log('\n📋 Configuration:');
  console.log('   USDC:', usdcAddress);
  console.log('   8004 Registry:', agentRegistry8004);

  // TODO: Deploy contracts
  // For now, show what would happen
  console.log('\n🚀 Deployment Steps:');
  console.log('1. Deploy TaskManager');
  console.log('   - Constructor args:', agentRegistry8004);
  console.log('2. Deploy PaymentHub');
  console.log('   - Constructor args:', usdcAddress, wallet.address);
  console.log('3. Configure contracts');
  console.log('   - TaskManager.setPaymentHub()');
  console.log('   - PaymentHub.setTaskManager()');

  console.log('\n⚠️  Note: Actual deployment requires compiled contract bytecode.');
  console.log('   To compile with Foundry:');
  console.log('   1. Install Foundry: curl -L https://foundry.paradigm.xyz | bash');
  console.log('   2. Run: forge build');
  console.log('   3. Then run this script again');
  
  // Alternative: Use hardhat or solc directly
  console.log('\n📝 Alternative: Use Hardhat for compilation and deployment');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
