# Gradience X Layer Deployment Makefile (Foundry)

.PHONY: help install build test create-wallet deploy verify

# Add Foundry to PATH
export PATH := $(HOME)/.config/.foundry/bin:$(PATH)

help:
	@echo "Gradience X Layer Deployment Commands (Foundry):"
	@echo "  make install       - Install Foundry dependencies"
	@echo "  make build         - Build contracts"
	@echo "  make test          - Run tests"
	@echo "  make create-wallet - Generate new deployer wallet"
	@echo "  make deploy        - Deploy to X Layer Testnet"
	@echo "  make verify        - Verify contracts on explorer"

install:
	forge install

build:
	forge build

test:
	forge test

create-wallet:
	@echo "Generating new wallet..."
	@cast wallet new
	@echo ""
	@echo "Save the address and private key!"
	@echo "Get testnet ETH from: https://www.okx.com/xlayer/faucet"

deploy:
	@echo "Deploying to X Layer Testnet..."
	@export PATH="$(HOME)/.config/.foundry/bin:$(PATH)" && \
	forge script script/Deploy.s.sol:DeployScript \
		--rpc-url https://rpc.xlayer.tech/testnet \
		--broadcast \
		-vvvv

verify:
	@echo "Verifying contracts..."
	@read -p "TaskManager Address: " task_manager; \
	read -p "PaymentHub Address: " payment_hub; \
	forge verify-contract $$task_manager TaskManager --chain xlayer-testnet; \
	forge verify-contract $$payment_hub PaymentHub --chain xlayer-testnet

# Local testing
anvil:
	anvil --fork-url https://rpc.xlayer.tech/testnet

deploy-local:
	@echo "Deploying to local Anvil..."
	@export PATH="$(HOME)/.config/.foundry/bin:$(PATH)" && \
	forge script script/Deploy.s.sol:DeployScript \
		--rpc-url http://localhost:8545 \
		--broadcast \
		-vvvv
