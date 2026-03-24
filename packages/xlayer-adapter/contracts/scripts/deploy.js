const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', (await deployer.provider.getBalance(deployer.address)).toString());

  // Get addresses from env
  const usdcAddress = process.env.USDC_TESTNET_ADDRESS;
  const agentRegistry8004 = process.env.AGENT_REGISTRY_8004;
  
  console.log('\nConfiguration:');
  console.log('  USDC:', usdcAddress);
  console.log('  8004 Registry:', agentRegistry8004);

  // Deploy TaskManager
  console.log('\nDeploying TaskManager...');
  const TaskManager = await hre.ethers.getContractFactory('TaskManager');
  const taskManager = await TaskManager.deploy(agentRegistry8004);
  await taskManager.waitForDeployment();
  console.log('TaskManager deployed to:', await taskManager.getAddress());

  // Deploy PaymentHub
  console.log('\nDeploying PaymentHub...');
  const PaymentHub = await hre.ethers.getContractFactory('PaymentHub');
  const paymentHub = await PaymentHub.deploy(usdcAddress, deployer.address);
  await paymentHub.waitForDeployment();
  console.log('PaymentHub deployed to:', await paymentHub.getAddress());

  // Configure contracts
  console.log('\nConfiguring contracts...');
  await taskManager.setPaymentHub(await paymentHub.getAddress());
  await paymentHub.setTaskManager(await taskManager.getAddress());
  console.log('Contracts configured');

  // Save deployment info
  console.log('\n=== Deployment Summary ===');
  console.log('Network: X Layer Testnet');
  console.log('TaskManager:', await taskManager.getAddress());
  console.log('PaymentHub:', await paymentHub.getAddress());
  console.log('USDC:', usdcAddress);
  console.log('8004 Registry:', agentRegistry8004);
  
  console.log('\nAdd to .env:');
  console.log(`TASK_MANAGER_ADDRESS=${await taskManager.getAddress()}`);
  console.log(`PAYMENT_HUB_ADDRESS=${await paymentHub.getAddress()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
