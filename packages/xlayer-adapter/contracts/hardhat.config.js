require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.19',
  networks: {
    'xlayer-testnet': {
      url: 'https://rpc.xlayer.tech/testnet',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 195,
    },
  },
  etherscan: {
    apiKey: {
      'xlayer-testnet': process.env.ETHERSCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'xlayer-testnet',
        chainId: 195,
        urls: {
          apiURL: 'https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER_TESTNET',
          browserURL: 'https://www.oklink.com/xlayer-test',
        },
      },
    ],
  },
};
