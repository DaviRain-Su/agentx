// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

/**
 * @title Create Wallet Script
 * @notice Helper script to generate a new wallet for deployment
 * @dev Run: forge script script/CreateWallet.s.sol
 */

contract CreateWalletScript is Script {
    function run() public {
        // Generate a new wallet
        (address addr, uint256 privateKey) = makeAddrAndKey("gradience_deployer");
        
        console.log("=== New Wallet Generated ===");
        console.log("Address:", addr);
        console.log("Private Key:", privateKey);
        console.log("");
        console.log("IMPORTANT:");
        console.log("1. Save the private key securely");
        console.log("2. Fund this address with X Layer testnet ETH");
        console.log("3. Add to .env file: PRIVATE_KEY=<private_key>");
        console.log("");
        console.log("X Layer Testnet Faucet: https://www.okx.com/xlayer/faucet");
    }
}
