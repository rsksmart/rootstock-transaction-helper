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
        try {
            let host = this.rskConfig.hostUrl;
            if(!host.startsWith('http') && !host.startsWith('https')){
                host = `http://${host}`;
            }
            this.web3Client = new Web3(host);
        }
        catch (err) {
            throw new RskTransactionHelperException('Error creating Web3 client', err);
        }
    }

    async signAndSendTransaction(senderAddress, senderPrivateKey, gasPrice, gasLimit, destinationAddress, abi, value) {
        try {

            const privateKey = Buffer.from(senderPrivateKey, 'hex');
        
            const rawTx = {
                nonce: this.web3Client.utils.toHex(await this.web3Client.eth.getTransactionCount(senderAddress, 'pending')),
                gasPrice: this.web3Client.utils.toBN(gasPrice),
                gasLimit: this.web3Client.utils.toBN(gasLimit),
                to: destinationAddress,
                value: this.web3Client.utils.toBN(value || '0x00'),
                data: abi,
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

    async getBalance(address) {
        return this.web3Client.utils.toBN(await this.web3Client.eth.getBalance(address));
    }

    async getGasPrice() {
        const gasPrice = this.web3Client.utils.toBN(await this.web3Client.eth.getGasPrice());
        if (gasPrice.isZero()) {
            return this.web3Client.utils.toBN('1');
        }
        return gasPrice;
    }

    async checkBalanceForCall(call, callerAddress) {
        const estimatedGas = this.web3Client.utils.toBN(await call.estimateGas());
        const gasPrice = await getGasPrice();

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

    async getTxReceipt(txHash) {
        return this.web3Client.eth.getTransactionReceipt(txHash);
    }

    async mine(amountOfBlocks = 1) {

        if(amountOfBlocks < 1) {
            throw new RskTransactionHelperException('Invalid `amountOfBlocks` provided. Needs to be greater than 0 if provided.');
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

    getClient() {
        return this.web3Client;
    }

    async getBlockNumber() {
        return await this.web3Client.eth.getBlockNumber();
    }

}

module.exports = RskTransactionHelper;

