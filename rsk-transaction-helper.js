'use strict';
const { ethers } = require('ethers');
const BN = require('bn.js');
const RskTransactionHelperException = require('./rsk-transaction-helper-error');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_RSK_CONFIG = {
    hostUrl: 'http://localhost:4444',
    maxAttempts: 1,
    attemptDelay: 1000,
};

const DEFAULT_TRANSFER_GAS_LIMIT = 21000;

const CONNECTION_ERROR_MESSAGE = `CONNECTION ERROR: Couldn't connect to node`;

// Helper function to convert various value types to BN
function toBN(value) {
    if (value instanceof BN) {
        return value;
    }
    // BN constructor accepts BigInt, numbers, strings, etc. directly
    return new BN(value);
}

/**
 * Converts an ethers TransactionReceipt to our TransactionReceipt type
 * @param {ethers.TransactionReceipt} ethersReceipt 
 * @returns {TransactionReceipt}
 */
function convertTransactionReceipt(ethersReceipt) {
    return {
        status: ethersReceipt.status === 1,
        transactionHash: ethersReceipt.hash,
        transactionIndex: ethersReceipt.index,
        blockHash: ethersReceipt.blockHash,
        blockNumber: Number(ethersReceipt.blockNumber),
        from: ethersReceipt.from,
        to: ethersReceipt.to,
        cumulativeGasUsed: ethersReceipt.gasUsed.toString(),
        gasUsed: ethersReceipt.gasUsed.toString(),
        effectiveGasPrice: ethersReceipt.gasPrice ? ethersReceipt.gasPrice.toString() : '0',
        logs: ethersReceipt.logs.map(log => ({
            address: log.address,
            topics: log.topics,
            data: log.data,
            logIndex: log.index,
            transactionIndex: log.transactionIndex,
            transactionHash: log.transactionHash,
            blockHash: log.blockHash,
            blockNumber: Number(log.blockNumber)
        })),
        logsBloom: ethersReceipt.logsBloom || ''
    };
}

/**
 * Converts an ethers Block to our Block type
 * @param {ethers.Block} ethersBlock 
 * @returns {Block}
 */
function convertBlock(ethersBlock) {
    return {
        number: Number(ethersBlock.number),
        hash: ethersBlock.hash,
        parentHash: ethersBlock.parentHash,
        timestamp: Number(ethersBlock.timestamp),
        gasLimit: ethersBlock.gasLimit.toString(),
        gasUsed: ethersBlock.gasUsed.toString(),
        miner: ethersBlock.miner,
        difficulty: ethersBlock.difficulty ? ethersBlock.difficulty.toString() : '0',
        totalDifficulty: ethersBlock.difficulty ? ethersBlock.difficulty.toString() : '0',
        size: ethersBlock.length || 0,
        transactions: ethersBlock.transactions,
        transactionsRoot: ethersBlock.transactionsRoot,
        stateRoot: ethersBlock.stateRoot,
        receiptsRoot: ethersBlock.receiptsRoot || ethersBlock.stateRoot
    };
}

class RskTransactionHelper {
    
    constructor(rskConfig) {
        this.rskConfig = Object.assign({}, DEFAULT_RSK_CONFIG, rskConfig);
        if(!this.rskConfig.hostUrl || (typeof this.rskConfig.hostUrl !== 'string')) {
            throw new Error('Invalid host provided');
        }
        try {
            if(this.rskConfig.maxAttempts < 1) {
                throw new Error('Invalid maxAttempts provided. Must be greater than 0.');
            }
            let host = this.rskConfig.hostUrl;
            if(!host.startsWith('http://') && !host.startsWith('https://')){
                host = `http://${host}`;
            }
            this.provider = new ethers.JsonRpcProvider(host);
        } catch (error) {
            throw new RskTransactionHelperException('Error creating ethers provider', error);
        }
    }

    async withRetryOnConnectionError(fn) {
        let attempts = 0;
        const maxAttempts = this.rskConfig.maxAttempts;
        while(attempts < maxAttempts) {
            try {
                return await fn();
            } catch (error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
        throw new Error(`Failed to execute function after attempting ${maxAttempts} time(s)`);
    }

    /**
     * Creates a transaction with the provided parameters, signs and sends it.
     * @param {string} senderAddress The `from` address in the transaction
     * @param {string} senderPrivateKey The `from` address private key to sign the transaction
     * @param {string} destinationAddress The `to` address in the transaction
     * @param {string} callData The `data` to be sent in the transaction
     * @param {number} value The `value` in wei to be sent in the transaction
     * @param {{ gasPrice: number, gasLimit: number }} gasOptions
     * @returns {string} The transaction hash
     */
    async signAndSendTransaction(senderAddress, senderPrivateKey, destinationAddress, callData, value, gasOptions) {
        if(!this.rskConfig.chainId) {
            throw new Error('chainId not provided');
        }
        try {
            const wallet = new ethers.Wallet(senderPrivateKey, this.provider);
            const transactionCount = await this.withRetryOnConnectionError(async () => await this.provider.getTransactionCount(senderAddress, 'pending'));
            const gasPrice = gasOptions.gasPrice ? toBN(gasOptions.gasPrice) : await this.getGasPrice();
            const gasLimit = gasOptions.gasLimit ? toBN(gasOptions.gasLimit) : toBN(DEFAULT_TRANSFER_GAS_LIMIT);
            
            const txRequest = {
                to: destinationAddress,
                value: value ? BigInt(value.toString()) : 0n,
                data: callData || '0x',
                nonce: transactionCount,
                gasPrice: BigInt(gasPrice.toString()),
                gasLimit: BigInt(gasLimit.toString()),
                chainId: Number(this.rskConfig.chainId),
                type: 0  // Explicitly set to legacy transaction type
            };
            
            // Use wallet to sign the transaction request
            const signedTx = await wallet.signTransaction(txRequest);
            
            const sendSignedTransaction = async () => {
                const txResponse = await this.provider.broadcastTransaction(signedTx);
                return txResponse.hash;
            };

            return await this.withRetryOnConnectionError(sendSignedTransaction);
                    
        } 
        catch (error) {
            // Preserve original error message in the wrapped exception
            const errorMessage = error.message || String(error);
            throw new RskTransactionHelperException(`Error on signAndSendTransaction: ${errorMessage}`, error);
        }
    } 

    /**
     * Checks if the caller's balance is enough to invoke the `call` function. If so, creates a transaction
     * with the provided parameters, signs and sends it.
     * @param {ContractSendMethod} call The `ContractSendMethod` where `call = myContract.methods.myMethod()`
     * @param {string} senderAddress The `from` address in the transaction
     * @param {string} senderPrivateKey The `from` address private key to sign the transaction
     * @param {string} destinationAddress The `to` address in the transaction
     * @param {number} estimatedGasPercentIncrement The percentage by which we estimate the gas will increment. Defaults to 10
     * @returns {string} The transaction hash
     */
    async signAndSendTransactionCheckingBalance(call, senderAddress, senderPrivateKey, destinationAddress, estimatedGasPercentIncrement = 10) {
        // Check sender address has enough balance
        const checkBalance = await this.withRetryOnConnectionError(async () => await this.checkBalanceForCall(call, senderAddress));

        if (!checkBalance.isEnough) {
            throw new Error(`Insufficient balance. Required: ${checkBalance.requiredBalance.toString()}, current balance: ${checkBalance.callerBalance.toString()}`);
        }

        const gasIncrement = 100 + estimatedGasPercentIncrement;

        // Add a percentage increment
        const gasLimit = checkBalance.estimatedGas.mul(toBN(gasIncrement.toString())).div(toBN('100'));

        // Sign and send raw transaction
            return await this.withRetryOnConnectionError(async () => {
            return await this.signAndSendTransaction(
                senderAddress, 
                senderPrivateKey, 
                destinationAddress, 
                call.encodeABI ? call.encodeABI() : call.data || '0x',
                0,
                {
                    gasPrice: BigInt(checkBalance.gasPrice.toString()),
                    gasLimit: BigInt(gasLimit.toString())
                }
            );
        });
    }

    /**
     * Transfers funds from one address to the other. Using the `senderPrivateKey` to sign the transaction.
     * @param {string} senderAddress The `from` address in the transaction
     * @param {string} senderPrivateKey The `from` address private key to sign the transaction
     * @param {string} destinationAddress The `to` address in the transaction
     * @param {number} value The `value` in wei to be sent in the transaction
     * @param {{ gasPrice?: number, gasLimit?: number }} gasOptions 
     * @returns {string} The transaction hash
     */
    async transferFunds(senderAddress, senderPrivateKey, destinationAddress, value, gasOptions = {}) {
        if(!this.rskConfig.chainId) {
            throw new Error('chainId not provided');
        }
        try {
            const wallet = new ethers.Wallet(senderPrivateKey, this.provider);
            const transactionCount = await this.withRetryOnConnectionError(async () => await this.provider.getTransactionCount(senderAddress, 'pending'));
            const gasPrice = gasOptions.gasPrice ? toBN(gasOptions.gasPrice) : await this.getGasPrice();
            const gasLimit = gasOptions.gasLimit ? toBN(gasOptions.gasLimit) : toBN(DEFAULT_TRANSFER_GAS_LIMIT);
            
            const txRequest = {
                to: destinationAddress,
                value: value ? BigInt(value.toString()) : 0n,
                nonce: transactionCount,
                gasPrice: BigInt(gasPrice.toString()),
                gasLimit: BigInt(gasLimit.toString()),
                chainId: Number(this.rskConfig.chainId),
                type: 0  // Explicitly set to legacy transaction type
            };

            // Use wallet to sign the transaction request
            const signedTx = await wallet.signTransaction(txRequest);
            
            const sendSignedTransaction = async () => {
                const txResponse = await this.provider.broadcastTransaction(signedTx);
                return txResponse.hash;
            };

            return await this.withRetryOnConnectionError(sendSignedTransaction);
        } catch (error) {
            // Preserve original error message in the wrapped exception
            const errorMessage = error.message || String(error);
            throw new RskTransactionHelperException(`Error on transferFunds: ${errorMessage}`, error);
        }
    }

    /**
     * Checks if the caller's balance is enough to transfer the specified `value`. If so, it sends the balances to the `destinationAddress`.
     * @param {string} senderAddress The `from` address in the transaction
     * @param {string} senderPrivateKey The `from` address private key to sign the transaction
     * @param {string} destinationAddress The `to` address in the transaction
     * @param {number} value The `value` in wei to be sent in the transaction
     * @param {{ gasPrice?: number, gasLimit?: number }} gasOptions 
     * @returns {string} The transaction hash
     */
    async transferFundsCheckingBalance(senderAddress, senderPrivateKey, destinationAddress, value, gasOptions = {}) {
        const balance = await this.getBalance(senderAddress);
        const gasPrice = gasOptions.gasPrice ? toBN(gasOptions.gasPrice) : await this.getGasPrice();
        const gasLimit = gasOptions.gasLimit ? toBN(gasOptions.gasLimit) : toBN(DEFAULT_TRANSFER_GAS_LIMIT);
        value = toBN(value);
        const requiredBalance = value.add(gasLimit.mul(gasPrice));
        if (requiredBalance.gt(balance)) {
            throw new Error(`Insufficient balance. Required: ${requiredBalance.toString()}, current balance: ${balance.toString()}`);
        }
        return this.transferFunds(senderAddress, senderPrivateKey, destinationAddress, value.toString(), gasOptions);
    }

    /**
     * Gets the current balances of the specified `address`
     * @param {string} address 
     * @returns {BN} The balance of this address
     */
    async getBalance(address) {
        const balance = await this.withRetryOnConnectionError(async () => await this.provider.getBalance(address));
        return toBN(balance);
    }

    /**
     * Gets the current gas price of the network
     * @returns {BN} The current gas price
     */
    async getGasPrice() {
        const feeData = await this.withRetryOnConnectionError(async () => await this.provider.getFeeData());
        const gasPrice = feeData.gasPrice || 0n;
        const gasPriceBn = toBN(gasPrice);
        return gasPriceBn.isZero() ? toBN('1') : gasPriceBn;
    }

    /**
     * Checks the estimated gas of the `call` method, the gas price and the caller's current balance.
     * @param {ContractSendMethod} call The `ContractSendMethod` where `call = myContract.methods.myMethod()`
     * @param {string} callerAddress The balance of the contract address
     * @returns {BalanceForCallResponse} The balance information that shows if the balance is enough to invoke the method `call`
     */
    async checkBalanceForCall(call, callerAddress) {
        const estimatedGas = await this.withRetryOnConnectionError(async () => {
            if (call.estimateGas) {
                return call.estimateGas();
            }
            // For ethers contract calls, estimateGas is a method that returns a promise
            if (typeof call.estimateGas === 'function') {
                return await call.estimateGas();
            }
            // Fallback: if it's already a number/bigint
            return BigInt(call.toString() || '0');
        });
        const estimatedGasBn = toBN(estimatedGas);
        const gasPrice = await this.getGasPrice();

        const requiredBalance = estimatedGasBn.mul(gasPrice);
        const callerBalance = await this.getBalance(callerAddress);

        return {
            estimatedGas: estimatedGasBn,
            requiredBalance: requiredBalance,
            callerBalance: callerBalance,
            isEnough: callerBalance.gt(requiredBalance),
            gasPrice: gasPrice
        };
    }

    /**
     * Returns the transaction receipt of this `txHash`
     * @param {string} txHash The transaction hash 
     * @returns {TransactionReceipt} The transaction receipt
     */
    async getTxReceipt(txHash) {
        const receipt = await this.withRetryOnConnectionError(async () => await this.provider.getTransactionReceipt(txHash));
        return convertTransactionReceipt(receipt);
    }

    /**
     * Manually mines blocks. Used in a regtest environment. Useful for testing.
     * @param {number} amountOfBlocks The amount of blocks to manually mine. Defaults to 1.
     * @returns {void}
     */
    async mine(amountOfBlocks = 1) {

        if(amountOfBlocks < 1) {
            throw new Error('Invalid `amountOfBlocks` provided. Needs to be greater than 0 if provided.');
        }

        const durationInMilliseconds = 1000 * 60; // 1 minute
        let id = Date.now();

        const evmIncreaseTime = async () => {
            try {
                const result = await this.provider.send('evm_increaseTime', [durationInMilliseconds]);
                return { jsonrpc: '2.0', id: id, result: result };
            } catch (error) {
                throw error;
            }
        };

        const evmMine = async (increaseTimeResult) => {
            try {
                const result = await this.provider.send('evm_mine', []);
                id = (increaseTimeResult.id || id) + 1;
                return { jsonrpc: '2.0', id: id, result: result };
            } catch (error) {
                throw error;
            }
        };

        for(let i = 0; i < amountOfBlocks; i++) {
            const increaseTimeResult = await this.withRetryOnConnectionError(async () => await evmIncreaseTime());
            await this.withRetryOnConnectionError(async () => await evmMine(increaseTimeResult));
        }

    }

    /**
     * 
     * @returns {JsonRpcProvider} The current provider instance being used
     */
    getClient() {
        return this.provider;
    }

    /**
     * 
     * @returns {number} The latest block number in the blockchain
     */
    async getBlockNumber() {
        return await this.withRetryOnConnectionError(async () => {
            const blockNumber = await this.provider.getBlockNumber();
            return Number(blockNumber);
        });
    }

    /**
     * 
     * @param {string} seed to be used to create the account
     * @returns {Promise<string>} returns the address of the account that was just created with the seed
     */
    async newAccountWithSeed(seed) {
        const sendNewAccountWithSeedRequest = async () => {
            try {
                const result = await this.provider.send('personal_newAccountWithSeed', [seed]);
                return result;
            } catch (error) {
                throw error;
            }
        };
        return await this.withRetryOnConnectionError(sendNewAccountWithSeedRequest);
    }

    /**
     * Calls the `updateBridge` method of the federator to run bookkeeping logic.
     * @returns {Promise<void>}
     */
    async updateBridge() {
        const sendUpdateBridgeRequest = async () => {
            try {
                await this.provider.send('fed_updateBridge', []);
            } catch (error) {
                throw error;
            }
        };
        return await this.withRetryOnConnectionError(sendUpdateBridgeRequest);
    }

    /**
     * @param {number | string} blockHashOrBlockNumber, block number or block hash. Defaults to 'latest'
     * @returns {Promise<Block>}
     */
    async getBlock(blockHashOrBlockNumber = 'latest') {
        const block = await this.withRetryOnConnectionError(async () => {
            if (blockHashOrBlockNumber === 'latest') {
                return await this.provider.getBlock('latest');
            }
            return await this.provider.getBlock(blockHashOrBlockNumber);
        });
        return convertBlock(block);
    }

    /**
     * @param {string} accountPrivateKey to be imported
     * @returns {Promise<string>} address of the imported account
     */
    async importAccount(accountPrivateKey) {
        return await this.withRetryOnConnectionError(async () => {
            return await this.provider.send('personal_importRawKey', [accountPrivateKey, '']);
        });
    }

    /**
     * @param {string} accountAddress to unlock
     * @returns {Promise<boolean>} true if unlocked successfully, false otherwise
     */
    async unlockAccount(accountAddress) {
        return await this.withRetryOnConnectionError(async () => {
            // Duration must be a hex string, 0x0 means unlock indefinitely
            return await this.provider.send('personal_unlockAccount', [accountAddress, '', '0x0']);
        });
    }

    /**
     * Sends a transaction to the blockchain using the provided `txConfig`
     * Note: This requires the account to be unlocked on the node, or the transaction to be pre-signed
     * @param {TransactionConfig} txConfig
     * @returns {string} The transaction hash
     */
    async sendTransaction(txConfig) {
        return await this.withRetryOnConnectionError(async () => {
            const result = await this.provider.send('eth_sendTransaction', [txConfig]);
            return result;
        });
    }

}

module.exports = RskTransactionHelper;
