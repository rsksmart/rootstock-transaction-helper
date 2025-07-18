import Web3 from 'web3';
import { TransactionReceipt, TransactionConfig } from 'web3-core';
import type { Block } from 'web3-eth';
import { ContractSendMethod } from 'web3-eth-contract';

import BN from 'bn.js';

export type BalanceForCallResponse = {
    estimatedGas: BN;
    requiredBalance: BN;
    callerBalance: BN,
    isEnough: boolean,
    gasPrice: BN
};

export type GasOptions = {
    gasPrice?: number;
    gasLimit?: number;
};

type Config = {
    hostUrl?: string,
    maxAttempts?: number,
    attemptDelay?: number,
    chainId?: number | string,
};

export class RskTransactionHelper {
    constructor(config?: Config);
    rskConfig: Config;
    web3Client: Web3;
    mine(amountOfBlocks?: number): Promise<void>;
    getClient(): Web3;
    getTxReceipt(): Promise<TransactionReceipt>;
    getGasPrice(): Promise<BN>;
    getBalance(address: string): Promise<BN>;
    transferFundsCheckingBalance(senderAddress: string, senderPrivateKey: string, destinationAddress: string, value: number, gasOptions?: GasOptions): Promise<string>;
    transferFunds(senderAddress: string, senderPrivateKey: string, destinationAddress: string, value: number, gasOptions?: GasOptions): Promise<string>;
    signAndSendTransaction(senderAddress: string, senderPrivateKey: string, destinationAddress: string, abi: string, value: number, gasOptions?: GasOptions): Promise<string>;
    signAndSendTransactionCheckingBalance(call: ContractSendMethod, senderAddress: string, senderPrivateKey: string, destinationAddress: string, estimatedGasPercentIncrement: number): Promise<string>;
    checkBalanceForCall(call: ContractSendMethod, callerAddress: string): Promise<BalanceForCallResponse>;
    getBlockNumber(): Promise<number>;
    sendTransaction(txConfig: TransactionConfig): Promise<string>;
    newAccountWithSeed(seed: string): Promise<string>;
    updateBridge(): Promise<void>;
    getBlock(blockHashOrBlockNumber: number | string): Promise<Block>;
    importAccount(privateKey: string): Promise<string>;
    unlockAccount(address: string): Promise<boolean>;
}
