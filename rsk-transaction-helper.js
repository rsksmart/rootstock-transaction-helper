"use strict";
const web3 = require('web3');
const Tx = require('ethereumjs-tx');
const RskTransactionHelperException = require('./rsk-transaction-helper-error');

const DEFAULT_RSK_CONFIG = {
    hostUrl: 'http://localhost:4450'
};

const TRANSFER_GAS_COST = 21000;

class RskTransactionHelper {
    
    constructor(rskConfig, web3Client) { 
        this.rskConfig = Object.assign({}, DEFAULT_RSK_CONFIG, rskConfig);
        this.web3Client = web3Client;
    }

    async signAndSendTransaction(senderAddress, senderPrivateKey, gasPrice, gasLimit, destinationAddress, abi, value) {
        try {

            const privateKey = Buffer.from(senderPrivateKey, 'hex');
        
            const rawTx = {
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

        const estimatedGas = 100 + estimatedGasPercentIncrement;

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
            const privateKey = Buffer.from(senderPrivateKey, 'hex');
            const rawTx = {
                nonce: this.web3Client.utils.toHex(await this.web3Client.eth.getTransactionCount(senderAddress, "pending")),
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
        const bnValue = this.web3Client.utils.toBN(value);
        const requiredBalance = bnValue.add(gasLimit.mul(gasPrice));
        if (requiredBalance.gt(balance)) {
            throw new Error(`Insufficient balance. Required: ${requiredBalance.toString()}, current balance: ${balance.toString()}`);
        }

        return this.transferFunds(senderAddress, senderPrivateKey, destinationAddress, bnValue, gasPrice);
    }

    async getBalance(address) {
        return this.web3Client.utils.toBN(await this.web3Client.eth.getBalance(address));
    }

    async getGasPrice() {
        const gasPrice = this.web3Client.utils.toBN(await this.web3Client.eth.getGasPrice());
        if (gasPrice.isZero()) {
            return this.web3Client.utils.toBN("1");
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

    async mine() {
        const duration = 1;
        const id = Date.now();

        await this.web3Client.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [duration],
            id: id,
        });

        await this.web3Client.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_mine',
            id: id + 1,
        });

    }

    extendClient(method) {
        this.web3Client.extend(method);
    }

    getClient() {
        return this.web3Client;
    }

}

class RskTransactionHelperBuilder {

    withRskConfig(rskConfig) {
        this.rskConfig = rskConfig;
    }

    withWeb3Client(web3Client) {
        this.web3Client = web3Client;
    }

    build() {
        const web3Client = this.web3Client || new web3(DEFAULT_RSK_CONFIG.hostUrl);
        const rskConfig = this.rskConfig || DEFAULT_RSK_CONFIG;
        const rskTransactionHelper = new RskTransactionHelper(rskConfig, web3Client);
        return rskTransactionHelper;
    }

}

module.exports = {
    RskTransactionHelper,
    RskTransactionHelperBuilder
};

