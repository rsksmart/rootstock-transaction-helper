'use strict';
const Web3 = require('web3');
const Tx = require('ethereumjs-tx');
const RskTransactionHelperException = require('./rsk-transaction-helper-error');

const DEFAULT_RSK_CONFIG = {
    hostUrl: 'http://localhost:4444'
};

const TRANSFER_GAS_COST = 21000;

class RskTransactionHelper {
    
    constructor(rskConfig) { 
        this.rskConfig = Object.assign({}, DEFAULT_RSK_CONFIG, rskConfig);

        if(!this.rskConfig.hostUrl || (typeof this.rskConfig.hostUrl !== 'string')) {
            throw new Error('Invalid host provided');
        }

        try {
            let host = this.rskConfig.hostUrl;
            if(!host.startsWith('http')){
                host = `http://${host}`;
            }
            this.web3Client = new Web3(host);
        } catch (err) {
            throw new RskTransactionHelperException('Error creating Web3 client', err);
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
    
            return new Promise((resolve, reject) => {
                this.web3Client.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
                    .once('transactionHash', resolve)
                    .once('error', reject);
            });
        } 
        catch (err) {
            throw new RskTransactionHelperException('Error on signAndSendTransaction', err);
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
        catch (err) {
            throw new RskTransactionHelperException('Error on transferFunds', err);
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
        const balance = await this.getBalance(senderAddress);
        const gasPrice = await this.getGasPrice();
        const gasLimit = this.web3Client.utils.toBN(TRANSFER_GAS_COST);
        value = this.web3Client.utils.toBN(value);
        const requiredBalance = value.add(gasLimit.mul(gasPrice));
        if (requiredBalance.gt(balance)) {
            throw new Error(`Insufficient balance. Required: ${requiredBalance.toString()}, current balance: ${balance.toString()}`);
        }

        return this.transferFunds(senderAddress, senderPrivateKey, destinationAddress, value, gasPrice);
    }

    /**
     * Gets the current balances of the specified `address`
     * @param {string} address 
     * @returns {BN} The balance of this address
     */
    async getBalance(address) {
        return this.web3Client.utils.toBN(await this.web3Client.eth.getBalance(address));
    }

    /**
     * Gets the current gas price of the network
     * @returns {BN} The current gas price
     */
    async getGasPrice() {
        const gasPrice = this.web3Client.utils.toBN(await this.web3Client.eth.getGasPrice());
        return gasPrice.isZero() ? this.web3Client.utils.toBN('1') : gasPrice;
    }

    /**
     * Checks the estimated gas of the `call` method, the gas price and the caller's current balance.
     * @param {ContractSendMethod} call The `ContractSendMethod` where `call = myContract.methods.myMethod()`
     * @param {string} callerAddress The balance of the contract address
     * @returns {BalanceForCallResponse} The balance information that shows if the balance is enough to invoke the method `call`
     */
    async checkBalanceForCall(call, callerAddress) {
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
    }

    /**
     * Returns the transaction receipt of this `txHash`
     * @param {string} txHash The transaction hash 
     * @returns {TransactionReceipt} The transaction receipt
     */
    async getTxReceipt(txHash) {
        return this.web3Client.eth.getTransactionReceipt(txHash);
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
            const increaseTimeResult = await evmIncreaseTime();
            await evmMine(increaseTimeResult);
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
        return await this.web3Client.eth.getBlockNumber();
    }

}

module.exports = RskTransactionHelper;
