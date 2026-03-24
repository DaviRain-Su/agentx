// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../TaskManager.sol";
import "../PaymentHub.sol";

/**
 * @title Deploy Script
 * @notice Deploy Gradience contracts to X Layer Testnet
 * @dev Run: forge script script/Deploy.s.sol --rpc-url $XLAYER_TESTNET_RPC --broadcast --verify
 */

contract DeployScript is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // X Layer Testnet addresses
        address usdcTestnet = vm.envAddress("USDC_TESTNET_ADDRESS");
        address agentRegistry8004 = vm.envAddress("AGENT_REGISTRY_8004");
        
        console.log("Deploying from:", deployer);
        console.log("USDC:", usdcTestnet);
        console.log("8004 Registry:", agentRegistry8004);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy TaskManager
        TaskManager taskManager = new TaskManager(agentRegistry8004);
        console.log("TaskManager deployed at:", address(taskManager));
        
        // Deploy PaymentHub
        PaymentHub paymentHub = new PaymentHub(usdcTestnet, deployer);
        console.log("PaymentHub deployed at:", address(paymentHub));
        
        // Configure contracts
        taskManager.setPaymentHub(address(paymentHub));
        paymentHub.setTaskManager(address(taskManager));
        
        console.log("Contracts configured");
        
        vm.stopBroadcast();
        
        // Log deployment info
        console.log("\n=== Deployment Summary ===");
        console.log("Network: X Layer Testnet");
        console.log("TaskManager:", address(taskManager));
        console.log("PaymentHub:", address(paymentHub));
        console.log("USDC:", usdcTestnet);
        console.log("8004 Registry:", agentRegistry8004);
        console.log("\nAdd to .env:");
        console.log("TASK_MANAGER_ADDRESS=", address(taskManager));
        console.log("PAYMENT_HUB_ADDRESS=", address(paymentHub));
    }
}
