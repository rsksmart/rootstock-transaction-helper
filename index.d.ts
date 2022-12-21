import Web3 from 'web3';
import { TransactionReceipt } from 'web3-core';
import BN from 'bn.js';

export interface RskTransactionHelper {
    rskConfig: {};
    web3Client: Web3;
    mine(amountOfBlocks?: number): void;
    extendClient(object: {}): void;
    getClient(): Web3;
    getTxReceipt(): TransactionReceipt;
    getGasPrice(): BN;
    getBalance(address: string): BN;
    transferFundsCheckingBalance(senderAddress: string, senderPrivateKey: string, destinationAddress: string, value: number): string;
    transferFunds(senderAddress: string, senderPrivateKey: string, destinationAddress: string, value: number, gasPrice: number): string;
}
