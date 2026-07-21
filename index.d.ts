import { JsonRpcProvider } from 'ethers';
import BN from 'bn.js';

// Re-export BN type for convenience
export { BN };

export type BalanceForCallResponse = {
    estimatedGas: BN;
    requiredBalance: BN;
    callerBalance: BN,
    isEnough: boolean,
    gasPrice: BN
};

export type GasOptions = {
    gasPrice?: number | string | bigint;
    gasLimit?: number | string | bigint;
};

type Config = {
    hostUrl?: string,
    maxAttempts?: number,
    attemptDelay?: number,
    chainId?: number | string,
};

// Contract method interface for estimating gas and encoding ABI
export interface ContractSendMethod {
    estimateGas(): Promise<bigint | number>;
    encodeABI?(): string;
    data?: string;
}

// TransactionReceipt type
export type TransactionReceipt = {
    status: boolean;
    transactionHash: string;
    transactionIndex: number;
    blockHash: string;
    blockNumber: number;
    from: string;
    to: string | null;
    cumulativeGasUsed: string;
    gasUsed: string;
    effectiveGasPrice: string;
    logs: Array<{
        address: string;
        topics: string[];
        data: string;
        logIndex: number;
        transactionIndex: number;
        transactionHash: string;
        blockHash: string;
        blockNumber: number;
    }>;
    logsBloom: string;
};

// Block type
export type Block = {
    number: number;
    hash: string;
    parentHash: string;
    timestamp: number;
    gasLimit: string;
    gasUsed: string;
    miner: string;
    difficulty: string;
    totalDifficulty: string;
    size: number;
    transactions: string[];
    transactionsRoot: string;
    stateRoot: string;
    receiptsRoot: string;
};

// TransactionConfig type
export type TransactionConfig = {
    from?: string;
    to?: string;
    value?: string | number | bigint;
    gas?: string | number | bigint;
    gasPrice?: string | number | bigint;
    data?: string;
    nonce?: number;
    chainId?: number;
};

export class RskTransactionHelper {
    constructor(config?: Config);
    rskConfig: Config;
    provider: JsonRpcProvider;
    mine(amountOfBlocks?: number): Promise<void>;
    getClient(): JsonRpcProvider;
    getTxReceipt(txHash: string): Promise<TransactionReceipt>;
    getGasPrice(): Promise<BN>;
    getBalance(address: string): Promise<BN>;
    transferFundsCheckingBalance(senderAddress: string, senderPrivateKey: string, destinationAddress: string, value: number | string | bigint, gasOptions?: GasOptions): Promise<string>;
    transferFunds(senderAddress: string, senderPrivateKey: string, destinationAddress: string, value: number | string | bigint, gasOptions?: GasOptions): Promise<string>;
    signAndSendTransaction(senderAddress: string, senderPrivateKey: string, destinationAddress: string, callData: string, value: number | string | bigint, gasOptions?: GasOptions): Promise<string>;
    signAndSendTransactionCheckingBalance(call: ContractSendMethod, senderAddress: string, senderPrivateKey: string, destinationAddress: string, estimatedGasPercentIncrement?: number): Promise<string>;
    checkBalanceForCall(call: ContractSendMethod, callerAddress: string): Promise<BalanceForCallResponse>;
    getBlockNumber(): Promise<number>;
    sendTransaction(txConfig: TransactionConfig): Promise<string>;
    newAccountWithSeed(seed: string): Promise<string>;
    updateBridge(): Promise<void>;
    getBlock(blockHashOrBlockNumber?: number | string): Promise<Block>;
    importAccount(privateKey: string): Promise<string>;
    unlockAccount(address: string): Promise<boolean>;
}
