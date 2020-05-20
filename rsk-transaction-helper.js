"use strict";
const peglib = require('peglib');
const Tx = require('ethereumjs-tx');
const RskTransactionHelperException = require('./rsk-transaction-helper-error');

const DEFAULT_RSK_CONFIG = {
    hostUrl: 'http://localhost:4444'
};

class RskTransactionHelper {
    constructor(rskConfig) { 
        this.rskConfig = Object.assign({}, DEFAULT_RSK_CONFIG, rskConfig);
        this.createRskClient();
        this.createWeb3Client();
    }

    createRskClient() {
        try {
            this.rskClient = peglib.rsk.getClient(this.rskConfig.hostUrl);
        }
        catch (err) {
            throw new RskTransactionHelperException('Error creating RSK client', err);
        }
    }

    createWeb3Client() {
        try {
            this.web3Client = new(require('web3'))(this.rskConfig.hostUrl);
        }
        catch (err) {
            throw new RskTransactionHelperException('Error creating Web3 client', err);
        }
    }

    async signAndSendTransaction(senderAddress, senderPrivateKey, gasPrice, gasLimit, destinationAddress, abi, value) {
        try {
            let privateKey = new Buffer(senderPrivateKey, 'hex');
        
            let rawTx = {
                nonce: this.web3Client.utils.toHex(await this.rskClient.eth.getTransactionCount(senderAddress, "pending")),
                gasPrice: gasPrice,
                gasLimit: gasLimit,
                to: destinationAddress,
                value: value || '0x00',
                data: abi,
                r: 0,
                s: 0,
                v: await this.rskClient.eth.net.getId()
            }
    
            let tx = new Tx(rawTx);
            tx.sign(privateKey);
    
            let serializedTx = tx.serialize();
    
            return new Promise((resolve, reject) => {
                this.rskClient.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
                    .once('transactionHash', resolve)
                    .once('error', reject);
            });
        } 
        catch (err) {
            throw new RskTransactionHelperException('Error on singAndSendTransacion', err);
        }
    } 

    async signAndSendTransactionCheckingBalance(call, senderAddress, senderPrivateKey, destinationAddress, estimatedGasPercentIncrement) {
        estimatedGasPercentIncrement == undefined ? 10 : estimatedGasPercentIncrement;
        
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
            checkBalance.estimatedGas.mul(this.rskClient.utils.toBN(estimatedGas.toString())).div(this.rskClient.utils.toBN("100")), // Add a 10% increment
            destinationAddress, 
            call.encodeABI()
        );
    }

    async checkBalanceForCall(call, callerAddress) {
        const estimatedGas = this.rskClient.utils.toBN(await call.estimateGas());
        let gasPrice = this.rskClient.utils.toBN(await this.rskClient.eth.getGasPrice());

        if (gasPrice.isZero()) {
            gasPrice = this.rskClient.utils.toBN("1");
        }

        const requiredBalance = estimatedGas.mul(gasPrice);
        const callerBalance = this.rskClient.utils.toBN(await this.rskClient.eth.getBalance(callerAddress));

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
