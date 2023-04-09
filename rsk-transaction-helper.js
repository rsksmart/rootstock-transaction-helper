'use strict';
const Web3 = require('web3');
const Tx = require('ethereumjs-tx');
const RskTransactionHelperException = require('./rsk-transaction-helper-error');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_RSK_CONFIG = {
    hostUrl: 'http://localhost:4444',
    maxAttempts: 1,
    attemptDelay: 1000,
};

const TRANSFER_GAS_COST = 21000;

const CONNECTION_ERROR_MESSAGE = `CONNECTION ERROR: Couldn't connect to node`;

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
            if(!host.startsWith('http')){
                host = `http://${host}`;
            }
            this.web3Client = new Web3(host);
        } catch (error) {
            throw new RskTransactionHelperException('Error creating Web3 client', error);
        }
    }

    /**
     * Creates a transaction with the provided parameters, signs and sends it.
     * @param {string} senderAddress The `from` address in the transaction
     * @param {string} senderPrivateKey The `from` address private key to sign the transaction
     * @param {BN} gasPrice
     * @param {BN} gasLimit 
     * @param {string} destinationAddress The `to` address in the transaction
     * @param {string} callData The `data` to be sent in the transaction
     * @param {Number} value The `value` in wei to be sent in the transaction
     * @returns {string} The transaction hash
     */
    async signAndSendTransaction(senderAddress, senderPrivateKey, gasPrice, gasLimit, destinationAddress, callData, value) {
        try {
            let attempts = 0;
            while (attempts < this.rskConfig.maxAttempts) {
                try {
                    const privateKey = Buffer.from(senderPrivateKey, 'hex');
                    const rawTx = {
                        nonce: this.web3Client.utils.toHex(await this.web3Client.eth.getTransactionCount(senderAddress, 'pending')),
                        gasPrice: this.web3Client.utils.toBN(gasPrice),
                        gasLimit: this.web3Client.utils.toBN(gasLimit),
                        to: destinationAddress,
                        value: this.web3Client.utils.toBN(value || '0x00'),
                        data: callData,
                        r: 0,
                        s: 0,
                        v: await this.web3Client.eth.net.getId()
                    }
            
                    const tx = new Tx(rawTx);
                    tx.sign(privateKey);
            
                    const serializedTx = tx.serialize();
            
                    const result = await new Promise((resolve, reject) => {
                        this.web3Client.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
                            .once('transactionHash', resolve)
                            .once('error', reject);
                    });
                    return result;
                } catch (error) {
                    // Only retrying if the error is a connection error.
                    if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                        throw new RskTransactionHelperException('Error on signAndSendTransaction', error);
                    }
                    await wait(this.rskConfig.attemptDelay);
                }
                attempts++;
            } 
        } 
        catch (error) {
            throw new RskTransactionHelperException('Error on signAndSendTransaction', error);
        }
    } 

    /**
     * Checks if the caller's balance is enough to invoke the `call` function. If so, creates a transaction
     * with the provided parameters, signs and sends it.
     * @param {ContractSendMethod} call The `ContractSendMethod` where `call = myContract.methods.myMethod()`
     * @param {string} senderAddress The `from` address in the transaction
     * @param {string} senderPrivateKey The `from` address private key to sign the transaction
     * @param {string} destinationAddress The `to` address in the transaction
     * @param {Number} estimatedGasPercentIncrement The percentage by which we estimate the gas will increment. Defaults to 10
     * @returns {string} The transaction hash
     */
    async signAndSendTransactionCheckingBalance(call, senderAddress, senderPrivateKey, destinationAddress, estimatedGasPercentIncrement = 10) {
        let attempts = 0;
        while (attempts < this.rskConfig.maxAttempts) {
            try {
                // Check sender address has enough balance
                const checkBalance = await this.checkBalanceForCall(call, senderAddress);

                if (!checkBalance.isEnough) {
                    throw new Error(`Insufficient balance. Required: ${checkBalance.requiredBalance.toString()}, current balance: ${checkBalance.callerBalance.toString()}`);
                }

                const gasIncrement = 100 + estimatedGasPercentIncrement;

                // Add a 10% increment
                const gasLimit = checkBalance.estimatedGas.mul(this.web3Client.utils.toBN(gasIncrement.toString())).div(this.web3Client.utils.toBN('100'));

                // Sign and send raw transaction
                return this.signAndSendTransaction(
                    senderAddress, 
                    senderPrivateKey, 
                    checkBalance.gasPrice, 
                    gasLimit,
                    destinationAddress, 
                    call.encodeABI()
                );
            } catch (error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
    }

    /**
     * Transfers funds from one address to the other. Using the `senderPrivateKey` to sign the transaction.
     * @param {string} senderAddress The `from` address in the transaction
     * @param {string} senderPrivateKey The `from` address private key to sign the transaction
     * @param {string} destinationAddress The `to` address in the transaction
     * @param {Number} value The `value` in wei to be sent in the transaction
     * @param {Number} gasPrice 
     * @returns {string} The transaction hash
     */
    async transferFunds(senderAddress, senderPrivateKey, destinationAddress, value, gasPrice) {
        let attempts = 0;
        while (attempts < this.rskConfig.maxAttempts) {
            try {
                const privateKey = Buffer.from(senderPrivateKey, 'hex');
                const rawTx = {
                    nonce: this.web3Client.utils.toHex(await this.web3Client.eth.getTransactionCount(senderAddress, 'pending')),
                    gasPrice: this.web3Client.utils.toBN(gasPrice),
                    gasLimit: this.web3Client.utils.toBN(TRANSFER_GAS_COST),
                    to: destinationAddress,
                    value: this.web3Client.utils.toBN(value || '0x00'),
                    r: 0,
                    s: 0,
                    v: await this.web3Client.eth.net.getId()
                }
        
                const tx = new Tx(rawTx);
                tx.sign(privateKey);
        
                const serializedTx = tx.serialize();
    
                return new Promise((resolve, reject) => {
                    this.web3Client.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
                        .once('transactionHash', resolve)
                        .once('error', reject);
                });
            } 
            catch (error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw new RskTransactionHelperException('Error on transferFunds', error);
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
    }

    /**
     * Checks if the caller's balance is enough to transfer the specified `value`. If so, it sends the balances to the `destinationAddress`.
     * @param {string} senderAddress The `from` address in the transaction
     * @param {string} senderPrivateKey The `from` address private key to sign the transaction
     * @param {string} destinationAddress The `to` address in the transaction
     * @param {Number} value The `value` in wei to be sent in the transaction
     * @returns {string} The transaction hash
     */
    async transferFundsCheckingBalance(senderAddress, senderPrivateKey, destinationAddress, value) {
        let attempts = 0;
        while (attempts < this.rskConfig.maxAttempts) {
            try {
                const balance = await this.getBalance(senderAddress);
                const gasPrice = await this.getGasPrice();
                const gasLimit = this.web3Client.utils.toBN(TRANSFER_GAS_COST);
                value = this.web3Client.utils.toBN(value);
                const requiredBalance = value.add(gasLimit.mul(gasPrice));
                if (requiredBalance.gt(balance)) {
                    throw new Error(`Insufficient balance. Required: ${requiredBalance.toString()}, current balance: ${balance.toString()}`);
                }
                return this.transferFunds(senderAddress, senderPrivateKey, destinationAddress, value, gasPrice);
            } catch (error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
    }

    /**
     * Gets the current balances of the specified `address`
     * @param {string} address 
     * @returns {BN} The balance of this address
     */
    async getBalance(address) {
        let attempts = 0;
        while(attempts < this.rskConfig.maxAttempts) {
            try {
                return this.web3Client.utils.toBN(await this.web3Client.eth.getBalance(address));
            } catch(error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
        throw new Error(`Error getting balance for address ${address} after attempting ${this.rskConfig.maxAttempts} times}`);
    }

    /**
     * Gets the current gas price of the network
     * @returns {BN} The current gas price
     */
    async getGasPrice() {
        let attempts = 0;
        while(attempts < this.rskConfig.maxAttempts) {
            try {
                const gasPrice =  this.web3Client.utils.toBN(await this.web3Client.eth.getGasPrice());
                return gasPrice.isZero() ? this.web3Client.utils.toBN('1') : gasPrice;
            } catch(error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
        throw new Error(`Error getting gas price after retrying ${this.rskConfig.maxAttempts} times}`);
    }

    /**
     * Checks the estimated gas of the `call` method, the gas price and the caller's current balance.
     * @param {ContractSendMethod} call The `ContractSendMethod` where `call = myContract.methods.myMethod()`
     * @param {string} callerAddress The balance of the contract address
     * @returns {BalanceForCallResponse} The balance information that shows if the balance is enough to invoke the method `call`
     */
    async checkBalanceForCall(call, callerAddress) {
        let attempts = 0;
        while(attempts < this.rskConfig.maxAttempts) {
            try {
                const estimatedGas = this.web3Client.utils.toBN(await call.estimateGas());
                const gasPrice = await this.getGasPrice();
        
                const requiredBalance = estimatedGas.mul(gasPrice);
                const callerBalance = await this.getBalance(callerAddress);
        
                return {
                    estimatedGas: estimatedGas,
                    requiredBalance: requiredBalance,
                    callerBalance: callerBalance,
                    isEnough: callerBalance.gt(requiredBalance),
                    gasPrice: gasPrice
                };

            } catch(error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
        throw new Error(`Error checking balance for call after retrying ${this.rskConfig.maxAttempts} times}`);
    }

    /**
     * Returns the transaction receipt of this `txHash`
     * @param {string} txHash The transaction hash 
     * @returns {TransactionReceipt} The transaction receipt
     */
    async getTxReceipt(txHash) {
        let attempts = 0;
        while(attempts < this.rskConfig.maxAttempts) {
            try {
                return await this.web3Client.eth.getTransactionReceipt(txHash);
            } catch(error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
    }

    /**
     * Manually mines blocks. Used in a regtest environment. Useful for testing.
     * @param {Number} amountOfBlocks The amount of blocks to manually mine. Defaults to 1.
     * @returns {void}
     */
    async mine(amountOfBlocks = 1) {

        if(amountOfBlocks < 1) {
            throw new Error('Invalid `amountOfBlocks` provided. Needs to be greater than 0 if provided.');
        }

        const durationInMilliseconds = 1000 * 60; // 1 minute
        let id = Date.now();

        const evmIncreaseTime = () => {
            return new Promise((resolve, reject) => {
                this.web3Client.currentProvider.send({
                    jsonrpc: '2.0',
                    method: 'evm_increaseTime',
                    params: [durationInMilliseconds],
                    id: id,
                }, (error, result) => {
                    if(error) {
                        return reject(error);
                    }
                    resolve(result);
                });
            });
        };

        const evmMine = (increaseTimeResult) => {
            return new Promise((resolve, reject) => {
                this.web3Client.currentProvider.send({
                    jsonrpc: '2.0',
                    method: 'evm_mine',
                    id: increaseTimeResult.id + 1,
                }, (error, result) => {
                    if(error) {
                        return reject(error);
                    }
                    id = result.id + 1;
                    resolve(result);
                });
            });
        };

        for(let i = 0; i < amountOfBlocks; i++) {
            let evmIncreaseTimeCallAttempts = 0;
            let increaseTimeResult;
            while(evmIncreaseTimeCallAttempts < this.rskConfig.maxAttempts) {
                try {
                    increaseTimeResult = await evmIncreaseTime();
                    break;
                } catch(error) {
                    // Only retrying if the error is a connection error.
                    if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                        throw error;
                    }
                    await wait(this.rskConfig.attemptDelay);
                }
                evmIncreaseTimeCallAttempts++;
            }
            let evmMineCallAttempts = 0;
            while(evmMineCallAttempts < this.rskConfig.maxAttempts) {
                try {
                    await evmMine(increaseTimeResult);
                    break;
                } catch(error) {
                    // Only retrying if the error is a connection error.
                    if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                        throw error;
                    }
                    // If the call to `evm_mine` fails, we need to decrease the counter so that the loop will try to mine again.
                    i--;
                    await wait(this.rskConfig.attemptDelay);
                }
                evmMineCallAttempts++;
            }
        }
    }

    /**
     * 
     * @returns {Web3} The current `Web3` instance being used
     */
    getClient() {
        return this.web3Client;
    }

    /**
     * 
     * @returns {Number} The latest block number in the blockchain
     */
    async getBlockNumber() {
        let attempts = 0;
        while(attempts < this.rskConfig.maxAttempts) {
            try {
                return await this.web3Client.eth.getBlockNumber();
            } catch(error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
    }

    /**
     * 
     * @param {string} seed to be used to create the account
     * @returns {Promise<string>} returns the address of the account that was just created with the seed
     */
    async newAccountWithSeed(seed) {
        let attempts = 0;
        while(attempts < this.rskConfig.maxAttempts) {
            try {
                const result = await new Promise((resolve, reject) => {
                    this.web3Client.currentProvider.send({
                        jsonrpc: '2.0',
                        method: 'personal_newAccountWithSeed',
                        params: [seed],
                        id: new Date().getTime(),
                    }, (error, response) => {
                        if(error) {
                            return reject(error);
                        }
                        resolve(response.result);
                    });
                });
                return result;
            } catch(error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
    }

    /**
     * Calls the `updateBridge` method of the federator to run bookkeeping logic.
     * @returns null
     */
    async updateBridge() {
        let attempts = 0;
        while(attempts < this.rskConfig.maxAttempts) {
            try {
                const result = await new Promise((resolve, reject) => {
                    this.web3Client.currentProvider.send({
                        jsonrpc: '2.0',
                        method: 'fed_updateBridge',
                        params: [],
                        id: new Date().getTime(),
                    }, (error, response) => {
                        if(error) {
                            return reject(error);
                        }
                        resolve(response.result);
                    });
                });
                return result;
            } catch(error) {
                // Only retrying if the error is a connection error.
                if (!error.message.includes(CONNECTION_ERROR_MESSAGE)) {
                    throw error;
                }
                await wait(this.rskConfig.attemptDelay);
            }
            attempts++;
        }
    }

}

module.exports = RskTransactionHelper;
