import Web3 from 'web3';
import { TransactionReceipt } from 'web3-core';
import { ContractSendMethod } from 'web3-eth-contract';

import BN from 'bn.js';

export type BalanceForCallResponse = {
    estimatedGas: BN;
    requiredBalance: BN;
    callerBalance: BN,
    isEnough: boolean,
    gasPrice: BN
};

export interface RskTransactionHelper {
    rskConfig: {};
    web3Client: Web3;
    mine(amountOfBlocks?: number): Promise<void>;
    getClient(): Web3;
    getTxReceipt(): Promise<TransactionReceipt>;
    getGasPrice(): Promise<BN>;
    getBalance(address: string): Promise<BN>;
    transferFundsCheckingBalance(senderAddress: string, senderPrivateKey: string, destinationAddress: string, value: number): Promise<string>;
    transferFunds(senderAddress: string, senderPrivateKey: string, destinationAddress: string, value: BN, gasPrice: BN): Promise<string>;
    signAndSendTransaction(senderAddress: string, senderPrivateKey: string, gasPrice: BN, gasLimit: BN, destinationAddress: string, abi: string, value: BN): Promise<string>;
    signAndSendTransactionCheckingBalance(call: ContractSendMethod, senderAddress: string, senderPrivateKey: string, destinationAddress: string, estimatedGasPercentIncrement: number): Promise<string>;
    checkBalanceForCall(call: ContractSendMethod, callerAddress: string): Promise<BalanceForCallResponse>;
}
