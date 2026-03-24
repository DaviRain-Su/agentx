#!/usr/bin/env node

/**
 * Create Wallet Script
 * Generate a new Ethereum wallet for X Layer deployment
 * No Foundry required - uses ethers.js
 */

const { ethers } = require('ethers');

function main() {
  // Generate random wallet
  const wallet = ethers.Wallet.createRandom();
  
  console.log('\n=== New Wallet Generated ===\n');
  console.log('Address:', wallet.address);
  console.log('Private Key:', wallet.privateKey);
  console.log('Mnemonic:', wallet.mnemonic.phrase);
  console.log('\n=== IMPORTANT ===');
  console.log('1. Save the private key securely!');
  console.log('2. Fund this address with X Layer testnet ETH');
  console.log('3. Add to .env file: PRIVATE_KEY=' + wallet.privateKey);
  console.log('\nX Layer Testnet Faucet: https://www.okx.com/xlayer/faucet');
  console.log('X Layer Explorer: https://www.oklink.com/xlayer-test\n');
}

main();
