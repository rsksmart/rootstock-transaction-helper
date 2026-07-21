<img src="./rootstock_logo.png" alt="Rootstock" />

# rootstock-transaction-helper
![Build and Test](https://github.com/rsksmart/rootstock-transaction-helper/actions/workflows/build-test.yml/badge.svg)
[![CodeQL](https://github.com/rsksmart/rootstock-transaction-helper/workflows/CodeQL/badge.svg)](https://github.com/rsksmart/rootstock-transaction-helper/actions?query=workflow%3ACodeQL)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/rsksmart/rootstock-transaction-helper/badge)](https://scorecard.dev/viewer/?uri=github.com/rsksmart/rootstock-transaction-helper)


Utility library to send transactions on Rootstock using ethers.js

## Installation

```
npm install @rsksmart/rootstock-transaction-helper
```

## Usage

### Creating an instance

```js
const { RskTransactionHelper } = require('@rsksmart/rootstock-transaction-helper');

const rskTxHelper = new RskTransactionHelper({
    hostUrl: 'http://localhost:4444', // defaults to 'http://localhost:4444'
    chainId: 31, // 30 for mainnet, 31 for testnet. Required by any method that signs a transaction
    maxAttempts: 3, // retries a call up to this many times if the node is unreachable. Defaults to 1
    attemptDelay: 1000, // milliseconds to wait between retries. Defaults to 1000
});
```

`chainId` is only required by the methods that sign a transaction (`transferFunds`, `transferFundsCheckingBalance`, `signAndSendTransaction`, `signAndSendTransactionCheckingBalance`); read-only methods work without it.

### Reading chain data

```js
const balance = await rskTxHelper.getBalance('0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826'); // BN, in wei
const gasPrice = await rskTxHelper.getGasPrice(); // BN, in wei

const blockNumber = await rskTxHelper.getBlockNumber();
const latestBlock = await rskTxHelper.getBlock(); // defaults to 'latest'
const blockByNumber = await rskTxHelper.getBlock(blockNumber);
const blockByHash = await rskTxHelper.getBlock(latestBlock.hash);

const txReceipt = await rskTxHelper.getTxReceipt('0x...');
```

### Transferring funds

```js
const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
const recipientAddress = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';
const value = 1000000000; // wei

// Sends `value` immediately.
const txHash = await rskTxHelper.transferFunds(senderAddress, senderPrivateKey, recipientAddress, value);

// Checks that `senderAddress` can cover `value` + gas before sending; throws otherwise.
const txHash2 = await rskTxHelper.transferFundsCheckingBalance(senderAddress, senderPrivateKey, recipientAddress, value);

// Both accept optional gas overrides:
const txHash3 = await rskTxHelper.transferFunds(senderAddress, senderPrivateKey, recipientAddress, value, {
    gasPrice: 65164000, // wei, defaults to the network's current gas price
    gasLimit: 21000, // defaults to 21000
});
```

### Calling a contract method (e.g. the RSK bridge)

`checkBalanceForCall` and `signAndSendTransactionCheckingBalance` work with anything shaped like a `ContractSendMethod` — an object exposing `estimateGas()` and either `encodeABI()` or a `data` string. This lines up with an [ethers `Contract`](https://docs.ethers.org/v6/api/contract/)'s method call:

```js
const { ethers } = require('ethers');

const bridgeAddress = '0x0000000000000000000000000000000001000006';
const bridgeAbi = ['function updateCollections()'];
const bridge = new ethers.Contract(bridgeAddress, bridgeAbi, rskTxHelper.getClient());

const call = {
    estimateGas: () => bridge.updateCollections.estimateGas(),
    data: bridge.interface.encodeFunctionData('updateCollections'),
};

// Just the balance check:
const { isEnough, requiredBalance, callerBalance } = await rskTxHelper.checkBalanceForCall(call, senderAddress);

// Balance check + sign + send in one call:
const txHash = await rskTxHelper.signAndSendTransactionCheckingBalance(call, senderAddress, senderPrivateKey, bridgeAddress);
```

For raw call data without a `ContractSendMethod` wrapper, use `signAndSendTransaction` directly:

```js
const txHash = await rskTxHelper.signAndSendTransaction(senderAddress, senderPrivateKey, bridgeAddress, callData, 0);
```

### Regtest / local-node helpers

These rely on RPC methods only available on a local dev/regtest node (`evm_mine`, `personal_newAccountWithSeed`, `fed_updateBridge`, etc.) — not on mainnet or testnet:

```js
await rskTxHelper.mine(); // mines 1 block, defaults to 1
const newAddress = await rskTxHelper.newAccountWithSeed('a seed');
const importedAddress = await rskTxHelper.importAccount(privateKey);
const unlocked = await rskTxHelper.unlockAccount(address);
await rskTxHelper.updateBridge();
```

### Error handling

Methods that wrap a signing/sending flow (`signAndSendTransaction`, `transferFunds`) reject with an `RskTransactionHelperException` on failure, which preserves the original error as its cause:

```js
const { RskTransactionHelperException } = require('@rsksmart/rootstock-transaction-helper');

try {
    await rskTxHelper.transferFunds(senderAddress, senderPrivateKey, recipientAddress, value);
} catch (error) {
    if (error instanceof RskTransactionHelperException) {
        console.error(error.message);
    }
}
```

See [index.d.ts](index.d.ts) for the full type definitions of every method, and [rsk-transaction-helper.js](rsk-transaction-helper.js) for the implementation and inline JSDoc.

## Running a sample

To run a sample, run:

> npm run sample

That script will use host 'http://localhost:4444' by default. To use a custom host, run:

> npm run sample <hostUrl>

For example:

> npm run sample http://localhost:4450

## Running unit tests

> npm run test

To also get a coverage report, run:

> npm run coverage

## Linting

> npm run lint

## Contributing

Any comments or suggestions feel free to contribute or reach out at our [open slack](https://dev.rootstock.io//slack).
