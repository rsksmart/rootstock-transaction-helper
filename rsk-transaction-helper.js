"use strict";
const web3 = require('web3');
const Tx = require('ethereumjs-tx');
const RskTransactionHelperException = require('./rsk-transaction-helper-error');

const DEFAULT_RSK_CONFIG = {
    hostUrl: 'http://localhost:4444'
};

const TRANSFER_GAS_COST = 21000;

class RskTransactionHelper {
    constructor(rskConfig) { 
        this.rskConfig = Object.assign({}, DEFAULT_RSK_CONFIG, rskConfig);
        this.createWeb3Client();
    }

    createWeb3Client() {
        try {
            this.web3Client = new web3(this.rskConfig.hostUrl);
        }
        catch (err) {
            throw new RskTransactionHelperException('Error creating Web3 client', err);
        }
    }

    async signAndSendTransaction(senderAddress, senderPrivateKey, gasPrice, gasLimit, destinationAddress, abi, value) {
        try {
            let privateKey = new Buffer(senderPrivateKey, 'hex');
        
            let rawTx = {
                nonce: this.web3Client.utils.toHex(await this.web3Client.eth.getTransactionCount(senderAddress, "pending")),
                gasPrice: this.web3Client.utils.toBN(gasPrice),
                gasLimit: this.web3Client.utils.toBN(gasLimit),
                to: destinationAddress,
                value: this.web3Client.utils.toBN(value || '0x00'),
                data: abi,
                r: 0,
                s: 0,
                v: await this.web3Client.eth.net.getId()
            }
    
            let tx = new Tx(rawTx);
            tx.sign(privateKey);
    
            let serializedTx = tx.serialize();
    
            return new Promise((resolve, reject) => {
                this.web3Client.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
                    .once('transactionHash', resolve)
                    .once('error', reject);
            });
        } 
        catch (err) {
            throw new RskTransactionHelperException('Error on singAndSendTransacion', err);
        }
    } 

    async signAndSendTransactionCheckingBalance(call, senderAddress, senderPrivateKey, destinationAddress, estimatedGasPercentIncrement = 10) {
        // Check sender address has enough balance
        const checkBalance = await this.checkBalanceForCall(call, senderAddress);

        if (!checkBalance.isEnough) {
            throw new Error(`Insufficient balance. Required: ${checkBalance.requiredBalance.toString()}, current balance: ${checkBalance.callerBalance.toString()}`);
        }

        let estimatedGas = 100 + estimatedGasPercentIncrement;

        // Sign and send raw transaction
        return this.signAndSendTransaction(
            senderAddress, 
            senderPrivateKey, 
            checkBalance.gasPrice, 
            checkBalance.estimatedGas.mul(this.web3Client.utils.toBN(estimatedGas.toString())).div(this.web3Client.utils.toBN("100")), // Add a 10% increment
            destinationAddress, 
            call.encodeABI()
        );
    }

    async transferFunds(senderAddress, senderPrivateKey, destinationAddress, value, gasPrice) {
        try {
            let privateKey = new Buffer(senderPrivateKey, 'hex');
        
            let rawTx = {
                nonce: this.web3Client.utils.toHex(await this.web3Client.eth.getTransactionCount(senderAddress, "pending")),
                gasPrice: this.web3Client.utils.toBN(gasPrice),
                gasLimit: this.web3Client.utils.toBN(TRANSFER_GAS_COST),
                to: destinationAddress,
                value: this.web3Client.utils.toBN(value || '0x00'),
                r: 0,
                s: 0,
                v: await this.web3Client.eth.net.getId()
            }
    
            let tx = new Tx(rawTx);
            tx.sign(privateKey);
    
            let serializedTx = tx.serialize();
    
            return new Promise((resolve, reject) => {
                this.web3Client.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
                    .once('transactionHash', resolve)
                    .once('error', reject);
            });
        } 
        catch (err) {
            throw new RskTransactionHelperException('Error on singAndSendTransacion', err);
        }
    }

    async transferFundsCheckingBalance(senderAddress, senderPrivateKey, destinationAddress, value, estimatedGasPercentIncrement = 10) {
        let balance = await this.getBalance(senderAddress);
        let gasPrice = await this.getGasPrice();
        let gasLimit = this.web3Client.utils.toBN(TRANSFER_GAS_COST);
        value = this.web3Client.utils.toBN(value);
        let requiredBalance = value.add(gasLimit.mul(gasPrice));
        if (requiredBalance.gt(balance)) {
            throw new Error(`Insufficient balance. Required: ${requiredBalance.toString()}, current balance: ${balance.toString()}`);
        }

        return this.transferFunds(senderAddress, senderPrivateKey, destinationAddress, value, gasPrice);
    }

    async getBalance(address) {
        return this.web3Client.utils.toBN(await this.web3Client.eth.getBalance(address));
    }

    async getGasPrice() {
        let gasPrice = this.web3Client.utils.toBN(await this.web3Client.eth.getGasPrice());
        if (gasPrice.isZero()) {
            return this.web3Client.utils.toBN("1");
        }
    }

    async checkBalanceForCall(call, callerAddress) {
        const estimatedGas = this.web3Client.utils.toBN(await call.estimateGas());
        let gasPrice = await getGasPrice();

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
}

module.exports = RskTransactionHelper;
