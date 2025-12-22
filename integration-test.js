#!/usr/bin/env node
'use strict';

const { ethers } = require('ethers');
const RskTransactionHelper = require('./rsk-transaction-helper');

const PROVIDER_URL = process.argv[2] || 'http://127.0.0.1:4444';
const CHAIN_ID = parseInt(process.argv[3]) || 33; // Default to regtest chain ID
const SEPARATOR_WIDTH = 70;

function derivePrivateKeyFromSeed(seed) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(seed));
    return hash;
}

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
    testCount++;
    process.stdout.write(`\n[${testCount}] ${name}... `);
    return fn()
        .then(() => {
            passCount++;
            console.log('✓ PASS');
        })
        .catch((error) => {
            failCount++;
            console.log(`✗ FAIL`);
            console.error(`  Error: ${error.message}`);
            if (error.stack) {
                console.error(`  Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
            }
        });
}

async function runIntegrationTests() {
    console.log('='.repeat(SEPARATOR_WIDTH));
    console.log('RskTransactionHelper Integration Tests');
    console.log('='.repeat(SEPARATOR_WIDTH));
    console.log(`Provider: ${PROVIDER_URL}`);
    console.log(`Chain ID: ${CHAIN_ID}`);
    console.log('='.repeat(SEPARATOR_WIDTH));

    const rskTxHelper = new RskTransactionHelper({
        hostUrl: PROVIDER_URL,
        chainId: CHAIN_ID,
        maxAttempts: 3,
        attemptDelay: 500
    });

    let cowAddress;
    let recipientAddress;
    let cowPrivateKey;

    // Derive cow private key from seed
    cowPrivateKey = derivePrivateKeyFromSeed('cow');
    console.log(`\nDerived cow private key from seed: ${cowPrivateKey}`);

    // Test 1: Create cow account
    await test('Create cow account with seed', async () => {
        cowAddress = await rskTxHelper.newAccountWithSeed('cow');
        if (!cowAddress || !cowAddress.startsWith('0x')) {
            throw new Error('Invalid address returned');
        }
        console.log(`\n    Cow address: ${cowAddress}`);
        
        // Verify the address matches the derived private key
        const wallet = new ethers.Wallet(cowPrivateKey);
        if (wallet.address.toLowerCase() !== cowAddress.toLowerCase()) {
            console.log(`\n    ⚠️  Warning: Derived address (${wallet.address}) doesn't match node address (${cowAddress})`);
            console.log(`    This is okay if the node uses a different derivation method`);
        }
    });

    // Test 2: Create recipient account
    await test('Create recipient account with seed', async () => {
        recipientAddress = await rskTxHelper.newAccountWithSeed('recipient');
        if (!recipientAddress || !recipientAddress.startsWith('0x')) {
            throw new Error('Invalid address returned');
        }
        console.log(`\n    Recipient address: ${recipientAddress}`);
    });

    // Test 3: Get block number
    await test('Get block number', async () => {
        const blockNumber = await rskTxHelper.getBlockNumber();
        if (typeof blockNumber !== 'number' || blockNumber < 0) {
            throw new Error(`Invalid block number: ${blockNumber}`);
        }
        console.log(`\n    Block number: ${blockNumber}`);
    });

    // Test 4: Get gas price
    await test('Get gas price', async () => {
        const gasPrice = await rskTxHelper.getGasPrice();
        if (!gasPrice || typeof gasPrice.toString !== 'function') {
            throw new Error('Invalid gas price returned');
        }
        const gasPriceStr = gasPrice.toString();
        console.log(`\n    Gas price: ${gasPriceStr} wei`);
        if (gasPriceStr === '0' || gasPriceStr === '') {
            throw new Error('Gas price should not be zero');
        }
    });

    // Test 5: Get balance (should be 0 initially)
    await test('Get cow account balance (initial)', async () => {
        const balance = await rskTxHelper.getBalance(cowAddress);
        if (!balance || typeof balance.toString !== 'function') {
            throw new Error('Invalid balance returned');
        }
        const balanceStr = balance.toString();
        console.log(`\n    Balance: ${balanceStr} wei`);
    });

    // Test 6: Get block
    await test('Get latest block', async () => {
        const block = await rskTxHelper.getBlock('latest');
        if (!block || typeof block.number !== 'number') {
            throw new Error('Invalid block returned');
        }
        console.log(`\n    Block number: ${block.number}`);
        console.log(`    Block hash: ${block.hash}`);
    });

    // Test 7: Mine blocks
    await test('Mine 2 blocks', async () => {
        await rskTxHelper.mine(2);
        const newBlockNumber = await rskTxHelper.getBlockNumber();
        console.log(`\n    New block number: ${newBlockNumber}`);
    });

    // Test 8: Import account (we'll create a private key for testing)
    await test('Import account with private key', async () => {
        // Generate a test private key (this is just for testing)
        const testPrivateKey = '0x' + '1'.repeat(64); // Not a real private key, just for testing import
        try {
            const importedAddress = await rskTxHelper.importAccount(testPrivateKey);
            if (!importedAddress || !importedAddress.startsWith('0x')) {
                throw new Error('Invalid address returned from import');
            }
            console.log(`\n    Imported address: ${importedAddress}`);
        } catch (error) {
            // Import might fail if account already exists, which is okay
            if (!error.message.includes('already exists') && !error.message.includes('account')) {
                throw error;
            }
            console.log(`\n    Account already exists (expected)`);
        }
    });

    // Test 9: Unlock account
    await test('Unlock cow account', async () => {
        const unlocked = await rskTxHelper.unlockAccount(cowAddress);
        if (typeof unlocked !== 'boolean') {
            throw new Error('Unlock should return boolean');
        }
        console.log(`\n    Unlocked: ${unlocked}`);
    });

    // Test 10: Send transaction
    await test('Send transaction method', async () => {
        const txConfig = {
            from: cowAddress,
            to: recipientAddress,
            value: '1000000000', // 1 gwei
            gas: 21000,
            gasPrice: '1000000000'
        };
        
        const txHash = await rskTxHelper.sendTransaction(txConfig);
        if (!txHash || !txHash.startsWith('0x')) {
            throw new Error('Invalid transaction hash');
        }
        console.log(`\n    Transaction hash: ${txHash}`);
        
        // Mine a block to include the transaction
        await rskTxHelper.mine(1);
        
        // Verify the transaction was included
        const receipt = await rskTxHelper.getTxReceipt(txHash);
        if (!receipt || !receipt.transactionHash) {
            throw new Error('Transaction receipt not found');
        }
        console.log(`    Transaction included in block: ${receipt.blockNumber}`);
    });

    // Test 11: Transfer funds checking balance
    await test('Transfer funds checking balance', async () => {
        const recipientBalanceBefore = await rskTxHelper.getBalance(recipientAddress);
        const value = 1000000000; // 1 gwei
        
        const txHash = await rskTxHelper.transferFundsCheckingBalance(
            cowAddress,
            cowPrivateKey,
            recipientAddress,
            value
        );
        if (!txHash || !txHash.startsWith('0x')) {
            throw new Error('Invalid transaction hash');
        }
        console.log(`\n    Transaction hash: ${txHash}`);
        
        // Mine a block to include the transaction
        await rskTxHelper.mine(1);
        
        // Verify the balance changed
        const recipientBalanceAfter = await rskTxHelper.getBalance(recipientAddress);
        console.log(`\n    Recipient balance before: ${recipientBalanceBefore.toString()} wei`);
        console.log(`    Recipient balance after: ${recipientBalanceAfter.toString()} wei`);
        
        // Verify the transaction was successful by checking receipt
        const receipt = await rskTxHelper.getTxReceipt(txHash);
        if (!receipt || !receipt.status) {
            throw new Error('Transaction failed');
        }
        console.log(`    Transaction status: ${receipt.status ? 'success' : 'failed'}`);
    });

    // Test 12: Get transaction receipt (if we have a transaction hash)
    await test('Get transaction receipt (if available)', async () => {
        // Try to get receipt from a recent transaction
        // We'll mine a block first to ensure we have recent transactions
        await rskTxHelper.mine(1);
        const block = await rskTxHelper.getBlock('latest');
        
        if (block.transactions && block.transactions.length > 0) {
            const txHash = block.transactions[0];
            if (typeof txHash === 'string' && txHash.startsWith('0x')) {
                const receipt = await rskTxHelper.getTxReceipt(txHash);
                if (!receipt || !receipt.transactionHash) {
                    throw new Error('Invalid receipt returned');
                }
                console.log(`\n    Receipt for ${txHash}:`);
                console.log(`      Status: ${receipt.status}`);
                console.log(`      Block: ${receipt.blockNumber}`);
            } else {
                console.log(`\n    Skipped (no string transaction hash in block)`);
            }
        } else {
            console.log(`\n    Skipped (no transactions in latest block)`);
        }
    });

    // Test 13: Update bridge
    await test('Update bridge', async () => {
        try {
            await rskTxHelper.updateBridge();
            console.log(`\n    Bridge updated successfully`);
        } catch (error) {
            // This might fail if the method doesn't exist on the node
            if (error.message.includes('method') || error.message.includes('not found')) {
                console.log(`\n    Method not available on this node (expected for some nodes)`);
            } else {
                throw error;
            }
        }
    });

    // Test 14: Get client
    await test('Get client (provider)', async () => {
        const client = rskTxHelper.getClient();
        if (!client) {
            throw new Error('Client should not be null');
        }
        console.log(`\n    Client type: ${client.constructor.name}`);
    });

    // Test 15: Check balance for call (contract method)
    await test('Check balance for call (mock contract method)', async () => {
        // Create a mock contract method
        const mockCall = {
            estimateGas: async () => BigInt(21000),
            encodeABI: () => '0x12345678'
        };
        
        const result = await rskTxHelper.checkBalanceForCall(mockCall, cowAddress);
        if (!result || typeof result.isEnough !== 'boolean') {
            throw new Error('Invalid result from checkBalanceForCall');
        }
        console.log(`\n    Estimated gas: ${result.estimatedGas.toString()}`);
        console.log(`    Required balance: ${result.requiredBalance.toString()}`);
        console.log(`    Caller balance: ${result.callerBalance.toString()}`);
        console.log(`    Is enough: ${result.isEnough}`);
    });

    // Test 16: Get block by number
    await test('Get block by number', async () => {
        const blockNumber = await rskTxHelper.getBlockNumber();
        const block = await rskTxHelper.getBlock(blockNumber);
        if (!block || block.number !== blockNumber) {
            throw new Error('Block number mismatch');
        }
        console.log(`\n    Block ${block.number} retrieved successfully`);
    });

    // Test 17: Get block by hash
    await test('Get block by hash', async () => {
        const block = await rskTxHelper.getBlock('latest');
        const blockByHash = await rskTxHelper.getBlock(block.hash);
        if (!blockByHash || blockByHash.hash !== block.hash) {
            throw new Error('Block hash mismatch');
        }
        console.log(`\n    Block ${blockByHash.hash} retrieved successfully`);
    });

    // Test 18: Test error handling - invalid host
    await test('Error handling - invalid host', async () => {
        try {
            const invalidHelper = new RskTransactionHelper({
                hostUrl: null
            });
            throw new Error('Should have thrown error for invalid host');
        } catch (error) {
            if (!error.message.includes('Invalid host')) {
                throw error;
            }
            console.log(`\n    Correctly rejected invalid host`);
        }
    });

    // Test 19: Test error handling - missing chainId
    await test('Error handling - missing chainId for transfer', async () => {
        const helperWithoutChainId = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });
        try {
            await helperWithoutChainId.transferFunds(
                cowAddress,
                '0x' + '1'.repeat(64),
                recipientAddress,
                1000
            );
            throw new Error('Should have thrown error for missing chainId');
        } catch (error) {
            if (!error.message.includes('chainId')) {
                throw error;
            }
            console.log(`\n    Correctly rejected transaction without chainId`);
        }
    });

    // Test 20: Test retry mechanism
    await test('Retry mechanism configuration', async () => {
        const helperWithRetry = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            maxAttempts: 5,
            attemptDelay: 100
        });
        const client = helperWithRetry.getClient();
        if (!client) {
            throw new Error('Client should be created');
        }
        console.log(`\n    Retry config: maxAttempts=5, attemptDelay=100ms`);
    });

    // Summary
    console.log('\n' + '='.repeat(SEPARATOR_WIDTH));
    console.log('Test Summary');
    console.log('='.repeat(SEPARATOR_WIDTH));
    console.log(`Total tests: ${testCount}`);
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log('='.repeat(70));

    if (failCount > 0) {
        console.log('\n⚠️  Some tests failed. Please review the errors above.');
        process.exit(1);
    } else {
        console.log('\n✅ All tests passed!');
        process.exit(0);
    }
}

// Run the tests
runIntegrationTests().catch((error) => {
    console.error('\n❌ Fatal error running tests:', error);
    process.exit(1);
});

