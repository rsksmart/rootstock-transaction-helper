<img src="./rootstock_logo.png" alt="Rootstock" />

# rootstock-transaction-helper
![Github CI/CD](https://github.com/rsksmart/rootstock-transaction-helper/actions/workflows/workflow.yml/badge.svg)
[![CodeQL](https://github.com/rsksmart/rootstock-transaction-helper/workflows/CodeQL/badge.svg)](https://github.com/rsksmart/rootstock-transaction-helper/actions?query=workflow%3ACodeQL)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/rsksmart/rootstock-transaction-helper/badge)](https://scorecard.dev/viewer/?uri=github.com/rsksmart/rootstock-transaction-helper)


Utility library to send transactions on Rootstock using ethers.js

## Running a sample

To run a sample, run:

> npm run sample

That script will use host 'http://localhost:4444' by default. To use a custom host, run:

> npm run sample <hostUrl>

For example:

> npm run sample http://localhost:4450

## Running unit tests

> npm run test

## Integration Tests

The project includes comprehensive integration tests that verify all functionality against a regtest node. These tests are designed to run against a local Rootstock regtest node with manual mining enabled.

### Running Integration Tests

```bash
# Run with defaults (http://127.0.0.1:4450, chainId 33)
npm run integration-test

# Run with custom URL and chain ID
node integration-test.js http://127.0.0.1:4444 31
```

### Prerequisites

- A running Rootstock regtest node with manual mining enabled
- The node should be accessible at the specified URL (default: `http://127.0.0.1:4444`)
- The node should support the `personal_newAccountWithSeed` RPC method for account creation

### Test Coverage

The integration tests cover:

- **Account Management**: Creating accounts with seeds, importing accounts, unlocking accounts
- **Blockchain Queries**: Getting block numbers, gas prices, balances, blocks, and transaction receipts
- **Transaction Operations**: Sending transactions, transferring funds with balance checking
- **Contract Operations**: Checking balance for contract method calls
- **Block Mining**: Manual block mining for regtest environments
- **Error Handling**: Invalid inputs, missing parameters, retry mechanisms
- **Special Operations**: Bridge updates, provider access

### Cow Account

The integration tests use a special "cow" account created from the seed `'cow'`. The private key for this account is automatically derived using keccak256 hashing of the seed. The tests assume this account always has sufficient funds for testing purposes.

### Test Output

The integration tests provide detailed output for each test case, including:
- Test name and status (✓ PASS / ✗ FAIL)
- Relevant data (addresses, transaction hashes, balances, etc.)
- Summary statistics at the end

## Contributing

Any comments or suggestions feel free to contribute or reach out at our [open slack](https://dev.rootstock.io//slack).
