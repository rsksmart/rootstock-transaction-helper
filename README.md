<img src="./rootstock_logo.png" alt="Rootstock" />

# rootstock-transaction-helper
![Github CI/CD](https://github.com/rsksmart/rootstock-transaction-helper/actions/workflows/workflow.yml/badge.svg)
[![CodeQL](https://github.com/rsksmart/rootstock-transaction-helper/workflows/CodeQL/badge.svg)](https://github.com/rsksmart/rootstock-transaction-helper/actions?query=workflow%3ACodeQL)

Utility library to send transactions on Rootstock using web3 and ethereum-js 

## Prerequisites

[NodeJs](https://nodejs.org/) latest LTS version.

## Installation

You can install the package using [npm](https://www.npmjs.com/package/@rsksmart/rootstock-transaction-helper).

```
npm install @rsksmart/rootstock-transaction-helper
```

## Usage

### Config object

In order to instantiate the rootstock-transaction-helper, a config object needs to be provided. The following elements can be provided as part of the config.

```
const config = {
    hostUrl: 'http://NODE_URL',
    maxAttempts: 1,
    attemptDelay: 1000,
    chainId: 31
};
```

- **hostUrl**: The url running a Rootstock node to connect to. **Required**
- **maxAttempts**: Max amount of attempts the library will try to execute the same operation in case there is a connection error with the node. Default value **1**.
- **attemptDelay**: Amount of time in milliseconds to wait between attempts when there is a connection error with the node. Default value **1000** milliseconds.
- **chainId**: The chain ID of the network connected to. No default value provided, only required to use **transferFunds** method.

### Instantiation

```
const RskTransactionHelper = require('@rsksmart/rootstock-transaction-helper');

const config = {
    hostUrl: 'http://NODE_URL',
    maxAttempts: 5,
    attemptDelay: 2000,
    chainId: 31
};

const rskTxHelper = new RskTransactionHelper(config);
```

### Available methods

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
getBlockNumber(): Promise<number>;
sendTransaction(txConfig: TransactionConfig): Promise<string>;

## Running a sample

To run a sample, run:

> npm run sample

That script will use host 'http://localhost:4444' by default. To use a custom host, run:

> npm run sample <hostUrl>

For example:

> npm run sample http://localhost:4450

## Running unit tests

> npm run test

## Contributing

Any comments or suggestions feel free to contribute or reach out at our [open slack](https://dev.rootstock.io//slack).
