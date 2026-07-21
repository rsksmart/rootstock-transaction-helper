const chai = require('chai');
const sinon = require('sinon');
const BN = require('bn.js');
const RskTransactionHelper = require('../rsk-transaction-helper');
const RskTransactionHelperError = require('../rsk-transaction-helper-error');
const chaiAsPromise = require('chai-as-promised');
chai.use(chaiAsPromise);
const assert = chai.assert;
const rewire = require('rewire');

// No actual call to this host is being made, but it's needed for the provider object to be created.
const PROVIDER_URL = 'http://localhost:4444';

const TEST_SENDER_ADDRESS = '0x0671fcbf6c14b08a18cb8db6e5345efaecb907c4';
const TEST_RECIPIENT_ADDRESS = '0xcfc833ca1ebb1d4fe19230585a601d0b392eeed7';
const TEST_TX_HASH = '0x49ea2e86436430232d69e3ef21ae08d111a4f23d666f8f3e8735b1ef5bda87b0';
const TEST_PRIVATE_KEY = 'b7ddc1c73a0f94479ec44c814d57aec904865dfa1e3487ec8c648ee7fb2daf3c';

const increaseTimeResultMock = '0x1';
const mineResultMock = null;
const newAccountWithSeedMock = TEST_SENDER_ADDRESS;
const updateBridgeMock = null;

const TRANSFER_GAS_COST = 21000;

const nonConnectionErrorMock = {
    message: 'A different error',
};

const connectionErrorMock = {
    message: `CONNECTION ERROR: Couldn't connect to node`,
};

// Helper to convert values to BN for testing
function toBN(value) {
    if (value instanceof BN) {
        return value;
    }
    // Convert BigInt to string for BN constructor
    if (typeof value === 'bigint') {
        return new BN(value.toString());
    }
    // Handle BN-like objects with .value property (for backward compatibility)
    if (value && typeof value === 'object' && 'value' in value) {
        return new BN(value.value.toString());
    }
    // Convert to string for BN constructor
    return new BN(value.toString());
}

describe('RskTransactionHelper tests', () => {

    it('should fail constructing the ethers provider', () => {

        const RskTransactionHelper = rewire('../rsk-transaction-helper');
        class JsonRpcProviderMock {
            constructor() {
                throw new Error('Provider creation error');
            }
        }
        RskTransactionHelper.__set__('ethers', { JsonRpcProvider: JsonRpcProviderMock });

        assert.throws(() => {
            new RskTransactionHelper({
                hostUrl: PROVIDER_URL
            });
        }, 'Error creating ethers provider');

    });

    it('should mine 1 block as expected', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).resolves(increaseTimeResultMock);
        providerSendStub.onCall(1).resolves(mineResultMock);
        
        await rskTransactionHelper.mine();

        assert.isTrue(providerSendStub.calledTwice, '`provider.send` method was not called twice');

        const evmIncreaseTimeCall = providerSendStub.getCall(0);
        const evmMineCall = providerSendStub.getCall(1);

        assert.equal(evmIncreaseTimeCall.args[0], 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');
        assert.equal(evmMineCall.args[0], 'evm_mine', 'Second call has to be to `evm_mine`');

        assert.equal(evmIncreaseTimeCall.args[1][0], 60000, 'Increase time param is 60000 milliseconds, which is a minute');

    });

    it('should mine multiple blocks (2) as expected', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();
        
        const providerSendStub = sinon.stub(provider, 'send');
        
        providerSendStub.onCall(0).resolves(increaseTimeResultMock);
        providerSendStub.onCall(1).resolves(mineResultMock);
        providerSendStub.onCall(2).resolves(increaseTimeResultMock);
        providerSendStub.onCall(3).resolves(mineResultMock);
        
        await rskTransactionHelper.mine(2);

        // 2 times for evm_increaseTime, 2 times for evm_mine
        sinon.assert.callCount(providerSendStub, 4, 'provider.send method should be called 4 times');

    });

    it('should fail if the `amountOfBlocks` to mine provided is 0', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        await chai.expect(rskTransactionHelper.mine(0)).to.eventually.be.rejectedWith(Error, 'Invalid `amountOfBlocks` provided. Needs to be greater than 0 if provided.');

    });

    it('should fail if the `amountOfBlocks` to mine provided is negative', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        await chai.expect(rskTransactionHelper.mine(-1)).to.eventually.be.rejectedWith(Error, 'Invalid `amountOfBlocks` provided. Needs to be greater than 0 if provided.');

    });

    it('should fail when the call to `evm_increaseTime` fails while trying to mine', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).rejects(nonConnectionErrorMock);
        
        const minePromise = rskTransactionHelper.mine();

        await chai.expect(minePromise).to.eventually.be.rejectedWith(nonConnectionErrorMock);

        assert.isTrue(providerSendStub.calledOnce, '`provider.send` method was not called once');

        const evmIncreaseTimeCall = providerSendStub.getCall(0);

        assert.equal(evmIncreaseTimeCall.args[0], 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');

        assert.equal(evmIncreaseTimeCall.args[1][0], 60000, 'Increase time param is 60000 milliseconds, which is a minute');

    });

    it('should fail when the call to `evm_mine` fails while trying to mine', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).resolves(increaseTimeResultMock);
        providerSendStub.onCall(1).rejects(nonConnectionErrorMock);
        
        const minePromise = rskTransactionHelper.mine();

        await chai.expect(minePromise).to.eventually.be.rejectedWith(nonConnectionErrorMock);

        assert.isTrue(providerSendStub.calledTwice, '`provider.send` method was not called twice');

        const evmIncreaseTimeCall = providerSendStub.getCall(0);
        const evmMineCall = providerSendStub.getCall(1);

        assert.equal(evmIncreaseTimeCall.args[0], 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');
        assert.equal(evmMineCall.args[0], 'evm_mine', 'Second call has to be to `evm_mine`');

        assert.equal(evmIncreaseTimeCall.args[1][0], 60000, 'Increase time param is 60000 milliseconds, which is a minute');

    });

    it('should return client', () => {
        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        assert.equal(rskTransactionHelper.getClient(), provider, 'Provider should be as expected');

    });

    it('should return the latest block number', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBlockNumber = 20;

        sinon.replace(provider, 'getBlockNumber', sinon.fake.resolves(BigInt(expectedBlockNumber)));

        const blockNumber = await rskTransactionHelper.getBlockNumber();

        assert.equal(blockNumber, expectedBlockNumber, '`blockNumber` is not as expected');

    })

    it('should return the balance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = 99999;

        sinon.replace(provider, 'getBalance', sinon.fake.resolves(BigInt(expectedBalance)));

        const balance = await rskTransactionHelper.getBalance(TEST_SENDER_ADDRESS);

        assert.equal(balance.toString(), expectedBalance.toString(), 'The balance is not as expected');

    });

    it('should return the gas price', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;

        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        const gasPrice = await rskTransactionHelper.getGasPrice();

        assert.equal(gasPrice.toString(), expectedGasPrice.toString(), 'The gas price is not as expected');

    });

    it('should return the default 1 gas price', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedGasPrice = 1;

        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: 0n }));

        const gasPrice = await rskTransactionHelper.getGasPrice();

        assert.equal(gasPrice.toString(), expectedGasPrice.toString(), 'The gas price is not as expected');

    });

    it('should transfer funds', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;

        const txResponse = {
            hash: TEST_TX_HASH
        };

        sinon.replace(provider, 'broadcastTransaction', sinon.fake.resolves(txResponse));
        sinon.replace(provider, 'getTransactionCount', sinon.fake.resolves(5));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        const senderPrivateKey = 'b7ddc1c73a0f94479ec44c814d57aec904865dfa1e3487ec8c648ee7fb2daf3c';
        const value = 1000000000;

        const result = await rskTransactionHelper.transferFunds(TEST_SENDER_ADDRESS, senderPrivateKey, TEST_RECIPIENT_ADDRESS, value, { gasPrice: expectedGasPrice });

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

        assert.isTrue(provider.broadcastTransaction.calledOnce, 'broadcastTransaction was called');

    });

    it('should fail to transfer funds when chainId is not provided', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const expectedGasPrice = 1000;

        const value = 1000000000;

        await chai.expect(
            rskTransactionHelper.transferFunds(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value, { gasPrice: expectedGasPrice })
        ).to.eventually.be.rejectedWith('chainId not provided');

    });

    it('should throw exception while trying to transfer funds', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        sinon.replace(provider, 'getTransactionCount', sinon.fake.rejects('Error getting transaction count'));

        const expectedGasPrice = 1000;
        const value = 1000000000;

        const transferFundsPromise = rskTransactionHelper.transferFunds(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value, { gasPrice: expectedGasPrice });

        await chai.expect(transferFundsPromise).to.eventually.be.rejectedWith('Error getting transaction count');

    });

    it('should transfer funds checking balance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = BigInt('999999999999999999997958000000');
        const expectedGasPrice = BigInt('1000');

        const txResponse = {
            hash: TEST_TX_HASH
        };

        sinon.replace(provider, 'broadcastTransaction', sinon.fake.resolves(txResponse));
        sinon.replace(provider, 'getBalance', sinon.fake.resolves(expectedBalance));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: expectedGasPrice }));
        sinon.replace(provider, 'getTransactionCount', sinon.fake.resolves(5));

        const value = 1000000000;

        const result = await rskTransactionHelper.transferFundsCheckingBalance(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value);

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

        assert.isTrue(provider.broadcastTransaction.calledOnce, 'broadcastTransaction was called');

    });

    it('should use the same gas price it checked the balance against when actually sending the transaction', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = BigInt('999999999999999999997958000000');

        const txResponse = {
            hash: TEST_TX_HASH
        };

        sinon.replace(provider, 'broadcastTransaction', sinon.fake.resolves(txResponse));
        sinon.replace(provider, 'getBalance', sinon.fake.resolves(expectedBalance));
        sinon.replace(provider, 'getTransactionCount', sinon.fake.resolves(5));

        // If the current network gas price changed between the balance check and the actual send, a second
        // independent `getFeeData` call here would silently use a different value than what was checked.
        const getFeeDataStub = sinon.stub(provider, 'getFeeData');
        getFeeDataStub.onCall(0).resolves({ gasPrice: BigInt(1000) });
        getFeeDataStub.onCall(1).resolves({ gasPrice: BigInt(9999999) });

        const value = 1000000000;

        const result = await rskTransactionHelper.transferFundsCheckingBalance(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value);

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

        sinon.assert.calledOnce(getFeeDataStub);

    });

    it('should transfer funds checking balance when `value` is already provided as a BN instance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = BigInt('999999999999999999997958000000');
        const expectedGasPrice = BigInt('1000');

        const txResponse = {
            hash: TEST_TX_HASH
        };

        sinon.replace(provider, 'broadcastTransaction', sinon.fake.resolves(txResponse));
        sinon.replace(provider, 'getBalance', sinon.fake.resolves(expectedBalance));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: expectedGasPrice }));
        sinon.replace(provider, 'getTransactionCount', sinon.fake.resolves(5));

        // Passing `value` as a BN instance exercises the `toBN` passthrough branch instead of converting from a number/string/bigint.
        const value = new BN(1000000000);

        const result = await rskTransactionHelper.transferFundsCheckingBalance(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value);

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

        assert.isTrue(provider.broadcastTransaction.calledOnce, 'broadcastTransaction was called');

    });

    it('should transfer funds checking balance when `value` and `gasOptions` are hex strings', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = BigInt('999999999999999999997958000000');

        const txResponse = {
            hash: TEST_TX_HASH
        };

        sinon.replace(provider, 'broadcastTransaction', sinon.fake.resolves(txResponse));
        sinon.replace(provider, 'getBalance', sinon.fake.resolves(expectedBalance));
        sinon.replace(provider, 'getTransactionCount', sinon.fake.resolves(5));

        // `toBN` used to throw ("Invalid character") on hex strings since bn.js defaults to base-10 parsing.
        const value = '0x3b9aca00'; // 1000000000
        const gasOptions = {
            gasPrice: '0x3e8', // 1000
            gasLimit: '0x5208', // 21000
        };

        const result = await rskTransactionHelper.transferFundsCheckingBalance(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value, gasOptions);

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

    });

    it('should sign and send transaction', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;
        const expectedGasLimit = TRANSFER_GAS_COST;

        const txResponse = {
            hash: TEST_TX_HASH
        };

        sinon.replace(provider, 'broadcastTransaction', sinon.fake.resolves(txResponse));
        sinon.replace(provider, 'getTransactionCount', sinon.fake.resolves(5));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        const value = 1000000000;

        const result = await rskTransactionHelper.signAndSendTransaction(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, '0x', value, {
            gasPrice: expectedGasPrice,
            gasLimit: expectedGasLimit
        });

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

        assert.isTrue(provider.broadcastTransaction.calledOnce, 'broadcastTransaction was called');

    });

    it('should sign and send transaction when `gasOptions` is omitted', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;

        const txResponse = {
            hash: TEST_TX_HASH
        };

        sinon.replace(provider, 'broadcastTransaction', sinon.fake.resolves(txResponse));
        sinon.replace(provider, 'getTransactionCount', sinon.fake.resolves(5));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        const value = 1000000000;

        // `gasOptions` is declared optional in index.d.ts, so it must also be optional at the call site.
        const result = await rskTransactionHelper.signAndSendTransaction(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, '0x', value);

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

    });

    it('should fail to sign and send transaction if chainId is not provided', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
        });

        const expectedGasPrice = 1000;
        const expectedGasLimit = TRANSFER_GAS_COST;

        const value = 1000000000;

        await chai.expect(
            rskTransactionHelper.signAndSendTransaction(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, '0x', value, {
                gasPrice: expectedGasPrice,
                gasLimit: expectedGasLimit
            })
        ).to.eventually.be.rejectedWith('chainId not provided');

    });

    it('should check balance for contract method call', async () => {

        const bridgeAddress = '0x0000000000000000000000000000000001000006';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = 9999999;
        const expectedGasPrice = 1000;
        const expectedEstimatedGas = 1234;
        const expectedRequiredBalance = expectedGasPrice * expectedEstimatedGas;

        const mockCall = {
            estimateGas: () => Promise.resolve(BigInt(expectedEstimatedGas)),
            encodeABI: () => '0x0d0cee93'
        };

        sinon.replace(provider, 'getBalance', sinon.fake.resolves(BigInt(expectedBalance)));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        const result = await rskTransactionHelper.checkBalanceForCall(mockCall, bridgeAddress);

        assert.equal(result.estimatedGas.toString(), expectedEstimatedGas.toString(), 'Resulting estimated gas is as expected');
        assert.equal(result.requiredBalance.toString(), expectedRequiredBalance.toString(), 'Resulting required balance is as expected');
        assert.equal(result.callerBalance.toString(), expectedBalance.toString(), 'Resulting caller balance is as expected');
        assert.equal(result.isEnough, true, 'It is enough');
        assert.equal(result.gasPrice.toString(), expectedGasPrice.toString(), 'Resulting gasPrice is as expected');

    });

    it('should check balance for a call using an already-known gas estimate when `estimateGas` is not a function', async () => {

        const bridgeAddress = '0x0000000000000000000000000000000001000006';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = 9999999;
        const expectedGasPrice = 1000;
        const knownGasEstimate = 1234;
        const expectedRequiredBalance = expectedGasPrice * knownGasEstimate;

        sinon.replace(provider, 'getBalance', sinon.fake.resolves(BigInt(expectedBalance)));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        // `call` here is a plain already-known gas estimate, not a `ContractSendMethod`-like object.
        const result = await rskTransactionHelper.checkBalanceForCall(knownGasEstimate, bridgeAddress);

        assert.equal(result.estimatedGas.toString(), knownGasEstimate.toString(), 'Resulting estimated gas is as expected');
        assert.equal(result.requiredBalance.toString(), expectedRequiredBalance.toString(), 'Resulting required balance is as expected');
        assert.equal(result.isEnough, true, 'It is enough');

    });

    it('should return `isEnough` as false when checking balance for a call and the balance is insufficient', async () => {

        const bridgeAddress = '0x0000000000000000000000000000000001000006';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = 100;
        const expectedGasPrice = 1000;
        const expectedEstimatedGas = 1234;
        const expectedRequiredBalance = expectedGasPrice * expectedEstimatedGas;

        const mockCall = {
            estimateGas: () => Promise.resolve(BigInt(expectedEstimatedGas))
        };

        sinon.replace(provider, 'getBalance', sinon.fake.resolves(BigInt(expectedBalance)));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        const result = await rskTransactionHelper.checkBalanceForCall(mockCall, bridgeAddress);

        assert.equal(result.requiredBalance.toString(), expectedRequiredBalance.toString(), 'Resulting required balance is as expected');
        assert.equal(result.callerBalance.toString(), expectedBalance.toString(), 'Resulting caller balance is as expected');
        assert.equal(result.isEnough, false, 'It should not be enough');

    });

    it('should sign and send transaction checking balance', async () => {

        const getStateForDebuggingSelector = '0x0d0cee93';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = 9999999;
        const expectedGasPrice = 1000;
        const expectedEstimatedGas = 1234;
        const expectedRequiredBalance = expectedGasPrice * expectedEstimatedGas;
        const expectedGasLimit = 1357;

        const checkBalanceForCallResponseMock = {
            estimatedGas: toBN(expectedEstimatedGas),
            requiredBalance: toBN(expectedRequiredBalance),
            callerBalance: toBN(expectedBalance),
            isEnough: true,
            gasPrice: toBN(expectedGasPrice)
        };

        sinon.replace(rskTransactionHelper, 'checkBalanceForCall', sinon.fake.resolves(checkBalanceForCallResponseMock));
        sinon.replace(provider, 'getBalance', sinon.fake.resolves(BigInt(expectedBalance)));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        // This `signAndSendTransaction` was already tested in previous tests. No need to test it again indirectly.
        sinon.stub(rskTransactionHelper, 'signAndSendTransaction').resolves(TEST_TX_HASH);

        const mockCall = {
            estimateGas: () => Promise.resolve(BigInt(expectedEstimatedGas)),
            encodeABI: () => getStateForDebuggingSelector
        };

        await rskTransactionHelper.signAndSendTransactionCheckingBalance(mockCall, TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS);

        const calledWithExpectedParameters = rskTransactionHelper.signAndSendTransaction.calledWith(
            TEST_SENDER_ADDRESS, 
            TEST_PRIVATE_KEY, 
            TEST_RECIPIENT_ADDRESS, 
            getStateForDebuggingSelector,
            0,
            {
                gasPrice: BigInt(checkBalanceForCallResponseMock.gasPrice.toString()),
                gasLimit: BigInt(toBN(expectedGasLimit).toString())
            }
        );

        assert.isTrue(calledWithExpectedParameters, '`signAndSendTransaction` is called with expected parameters');

    });

    it('should return tx receipt', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedTxReceipt = {
            status: 1,
            hash: TEST_TX_HASH,
            index: 1,
            blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            blockNumber: 1n,
            from: TEST_SENDER_ADDRESS,
            to: TEST_RECIPIENT_ADDRESS,
            gasUsed: 20n,
            gasPrice: 1000n,
            logs: [],
            logsBloom: '0x'
        };

        sinon.replace(provider, 'getTransactionReceipt', sinon.fake.resolves(expectedTxReceipt));

        const txReceipt = await rskTransactionHelper.getTxReceipt(TEST_TX_HASH);

        assert.isTrue(provider.getTransactionReceipt.calledWith(TEST_TX_HASH), 'Was not called with expected txHash');
        
        assert.equal(txReceipt.status, true, 'tx receipt status should be true');
        assert.equal(txReceipt.transactionHash, TEST_TX_HASH, 'tx receipt hash should match');

    });

    it('should return tx receipt with its logs converted', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedLog = {
            address: '0x0000000000000000000000000000000001000006',
            topics: ['0x0d0cee93'],
            data: '0x01',
            index: 0,
            transactionIndex: 1,
            transactionHash: TEST_TX_HASH,
            blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            blockNumber: 1n
        };

        const expectedTxReceipt = {
            status: 1,
            hash: TEST_TX_HASH,
            index: 1,
            blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            blockNumber: 1n,
            from: TEST_SENDER_ADDRESS,
            to: TEST_RECIPIENT_ADDRESS,
            gasUsed: 20n,
            cumulativeGasUsed: 120n, // Deliberately distinct from `gasUsed`, since it accounts for the whole block up to this tx.
            gasPrice: 1000n,
            logs: [expectedLog],
            logsBloom: '0x'
        };

        sinon.replace(provider, 'getTransactionReceipt', sinon.fake.resolves(expectedTxReceipt));

        const txReceipt = await rskTransactionHelper.getTxReceipt(TEST_TX_HASH);

        assert.equal(txReceipt.cumulativeGasUsed, '120', 'cumulativeGasUsed should not be conflated with gasUsed');
        assert.equal(txReceipt.gasUsed, '20', 'gasUsed should be unaffected');

        assert.equal(txReceipt.logs.length, 1, 'tx receipt should have one log');
        assert.equal(txReceipt.logs[0].address, expectedLog.address, 'log address should match');
        assert.deepEqual(txReceipt.logs[0].topics, expectedLog.topics, 'log topics should match');
        assert.equal(txReceipt.logs[0].data, expectedLog.data, 'log data should match');
        assert.equal(txReceipt.logs[0].logIndex, expectedLog.index, 'log index should be mapped to `logIndex`');
        assert.equal(txReceipt.logs[0].blockNumber, Number(expectedLog.blockNumber), 'log blockNumber should be converted to a number');

    });

    it('should add "http://" to host', () => {

        const expectedHost = 'http://localhost:4444';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: 'localhost:4444'
        });

        const provider = rskTransactionHelper.getClient();

        assert.equal(provider._getConnection().url, expectedHost, 'Host URL was not normalized as expected');

    });

    it('should fail if passed an invalid host', () => {

        assert.throws(() => {
            new RskTransactionHelper({
                hostUrl: null
            });
        }, 'Invalid host provided');

    });

    it('should fail constructing the helper if `maxAttempts` is less than 1', () => {

        assert.throws(() => {
            new RskTransactionHelper({
                hostUrl: PROVIDER_URL,
                maxAttempts: 0
            });
        }, RskTransactionHelperError, 'Error creating ethers provider');

    });

    it('should throw an error while trying to sign and send transaction', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const provider = rskTransactionHelper.getClient();

        sinon.replace(provider, 'getTransactionCount', sinon.fake.rejects('Error getting transaction count'));

        const value = 1000000000;
        const expectedGasPrice = 1000;
        const expectedGasLimit = TRANSFER_GAS_COST;

        const signAndSendTransactionPromise = rskTransactionHelper.signAndSendTransaction(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, '0x', value, {
            gasPrice: expectedGasPrice,
            gasLimit: expectedGasLimit
        });

        await chai.expect(signAndSendTransactionPromise).to.eventually.be.rejectedWith(RskTransactionHelperError, 'Error on signAndSendTransaction');

    });

    it('should fail with insufficient error', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const expectedBalance = 9999999;
        const expectedGasPrice = 1000;
        const expectedEstimatedGas = 1234;
        const expectedRequiredBalance = expectedGasPrice * expectedEstimatedGas;

        const checkBalanceForCallResponseMock = {
            estimatedGas: toBN(expectedEstimatedGas),
            requiredBalance: toBN(expectedRequiredBalance),
            callerBalance: toBN(expectedBalance),
            isEnough: false,
            gasPrice: toBN(expectedGasPrice)
        };

        sinon.replace(rskTransactionHelper, 'checkBalanceForCall', sinon.fake.resolves(checkBalanceForCallResponseMock));
       
        const mockCall = {
            estimateGas: () => Promise.resolve(BigInt(expectedEstimatedGas)),
            encodeABI: () => '0x0d0cee93'
        };

        const signAndSendTransactionCheckingBalancePromise = rskTransactionHelper.signAndSendTransactionCheckingBalance(mockCall, TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS);

        await chai.expect(signAndSendTransactionCheckingBalancePromise).to.eventually.be.rejectedWith(Error, 'Insufficient balance. Required: 1234000, current balance: 9999999');

    });

    it('should fail with insufficient error while checking balance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = 1;
        const expectedGasPrice = 1000;

        sinon.replace(provider, 'getBalance', sinon.fake.resolves(BigInt(expectedBalance)));
        sinon.replace(provider, 'getFeeData', sinon.fake.resolves({ gasPrice: BigInt(expectedGasPrice) }));

        const value = 1000000000;

        const transferFundsCheckingBalancePromise = rskTransactionHelper.transferFundsCheckingBalance(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value);

        await chai.expect(transferFundsCheckingBalancePromise).to.eventually.be.rejectedWith(Error, 'Insufficient balance. Required: 1021000000, current balance: 1');

    });

    it('should create a new account with seed', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).resolves(newAccountWithSeedMock);

        const seed = 'seed';
        
        const newAccount = await rskTransactionHelper.newAccountWithSeed(seed);

        assert.isTrue(providerSendStub.calledOnce, '`provider.send` method was not called once');

        const newAccountWithSeedCall = providerSendStub.getCall(0);

        assert.equal(newAccountWithSeedCall.args[0], 'personal_newAccountWithSeed', 'Method is not as expected');

        assert.equal(newAccountWithSeedCall.args[1][0], seed, 'Did not use the expected seed');

        assert.equal(newAccount, newAccountWithSeedMock, 'Returned account address is not as expected');

    });

    it('should fail with "error" while trying to create a new account with seed', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).rejects(nonConnectionErrorMock);

        const seed = 'seed';
        
        await chai.expect(rskTransactionHelper.newAccountWithSeed(seed)).to.eventually.be.rejectedWith(nonConnectionErrorMock);

    });

    it('should update the bridge', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).resolves(updateBridgeMock);

        const updateBridgeResponse = await rskTransactionHelper.updateBridge();

        assert.isTrue(providerSendStub.calledOnce, '`provider.updateBridge` method was not called once');

        const updateBridgeCall = providerSendStub.getCall(0);

        assert.equal(updateBridgeCall.args[0], 'fed_updateBridge', 'Expected provider method was not called');

        assert.isEmpty(updateBridgeCall.args[1], 'Params should be empty');

        assert.isUndefined(updateBridgeResponse, 'Returned should be undefined as expected');

    });

    it('should fail with "error" while trying to call updateBridge', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).rejects(nonConnectionErrorMock);
        
        await chai.expect(rskTransactionHelper.updateBridge()).to.eventually.be.rejectedWith(nonConnectionErrorMock);

    });

    it('should return the balance with attempts', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            maxAttempts: 3,
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBalance = 99999;

        sinon.replace(provider, 'getBalance', sinon.fake.resolves(BigInt(expectedBalance)));

        const balance = await rskTransactionHelper.getBalance(TEST_SENDER_ADDRESS);

        assert.equal(balance.toString(), expectedBalance.toString(), 'The balance is not as expected');

    });

    it('should mine 1 block as expected after failing due to connection error 2 times', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            maxAttempts: 3,
            attemptDelay: 100, // Using a small delay to speed up the test and avoid timeout issues.
        });

        const provider = rskTransactionHelper.getClient();

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).resolves(increaseTimeResultMock); // evm_increaseTime
        providerSendStub.onCall(1).rejects(connectionErrorMock); // evm_mine

        providerSendStub.onCall(2).rejects(connectionErrorMock); // evm_mine

        providerSendStub.onCall(3).resolves(mineResultMock); // evm_mine
        
        await rskTransactionHelper.mine();

        sinon.assert.callCount(providerSendStub, 4, 'provider.send method should be called 4 times');

        const evmIncreaseTimeCall = providerSendStub.getCall(0);
        const evmMineCall = providerSendStub.getCall(1);

        assert.equal(evmIncreaseTimeCall.args[0], 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');
        assert.equal(evmMineCall.args[0], 'evm_mine', 'Second call has to be to `evm_mine`');

        assert.equal(evmIncreaseTimeCall.args[1][0], 60000, 'Increase time param is 60000 milliseconds, which is a minute');

    });

    it('should retry on a real ethers/Node.js connection-refused error, not just the legacy web3 error message', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            maxAttempts: 2,
            attemptDelay: 10,
        });

        const provider = rskTransactionHelper.getClient();

        const econnrefusedError = Object.assign(new Error(''), { code: 'ECONNREFUSED' });

        const providerSendStub = sinon.stub(provider, 'send');

        providerSendStub.onCall(0).rejects(econnrefusedError);
        providerSendStub.onCall(1).resolves(updateBridgeMock);

        await rskTransactionHelper.updateBridge();

        sinon.assert.callCount(providerSendStub, 2, 'provider.send should have been retried after the connection error');

    });

    it('should not retry on a non-connection error even if it has no message', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            maxAttempts: 2,
            attemptDelay: 10,
        });

        const provider = rskTransactionHelper.getClient();

        const genericError = Object.assign(new Error(''), { code: 'CALL_EXCEPTION' });

        sinon.stub(provider, 'send').rejects(genericError);

        await chai.expect(rskTransactionHelper.updateBridge()).to.eventually.be.rejectedWith(genericError);

        sinon.assert.calledOnce(provider.send);

    });

    it('should fail after exhausting all retry attempts on a persistent connection error', async () => {

        const maxAttempts = 2;

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            maxAttempts,
            attemptDelay: 10,
        });

        const provider = rskTransactionHelper.getClient();

        sinon.stub(provider, 'send').rejects(connectionErrorMock);

        await chai.expect(rskTransactionHelper.updateBridge()).to.eventually.be.rejectedWith(Error, `Failed to execute function after attempting ${maxAttempts} time(s)`);

        sinon.assert.callCount(provider.send, maxAttempts);

    });

    it(`should return the block and be called with the 'latest' param if none specified`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const expectedBlock = {
            number: 5n,
            hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            timestamp: 1234567890n,
            gasLimit: 8000000n,
            gasUsed: 1000000n,
            miner: TEST_SENDER_ADDRESS,
            difficulty: 0n,
            transactions: [],
            transactionsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            receiptsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            logsBloom: '0x'
        };

        sinon.replace(provider, 'getBlock', sinon.fake.resolves(expectedBlock));
        sinon.replace(provider, 'send', sinon.fake.resolves({ size: '0x220' }));

        const block = await rskTransactionHelper.getBlock();

        assert.isTrue(provider.getBlock.calledWith('latest'), 'Was not called with expected latest param');

        assert.equal(block.number, 5, 'The block number is not as expected');

        assert.equal(block.size, 544, 'The block size is not as expected');

    });

    it(`should return the block and be called with the specified block number`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const blockNumber = 5;

        const expectedBlock = {
            number: BigInt(blockNumber),
            hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            timestamp: 1234567890n,
            gasLimit: 8000000n,
            gasUsed: 1000000n,
            miner: TEST_SENDER_ADDRESS,
            difficulty: 0n,
            transactions: [],
            transactionsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            receiptsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            logsBloom: '0x'
        };

        sinon.replace(provider, 'getBlock', sinon.fake.resolves(expectedBlock));
        sinon.replace(provider, 'send', sinon.fake.resolves({ size: '0x220' }));

        const block = await rskTransactionHelper.getBlock(blockNumber);

        assert.isTrue(provider.getBlock.calledWith(blockNumber), `Was not called with expected block number param`);

        assert.equal(block.number, blockNumber, 'The block number is not as expected');

        assert.equal(block.size, 544, 'The block size is not as expected');

    });

    it(`should return the block and be called with the specified block hash`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const blockHash = '0x053a9e84bd5eae90834da13fa25af17307b405d6eb3f3dd34a31450a7067c76b';

        const expectedBlock = {
            hash: blockHash,
            number: 5n,
            parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            timestamp: 1234567890n,
            gasLimit: 8000000n,
            gasUsed: 1000000n,
            miner: TEST_SENDER_ADDRESS,
            difficulty: 0n,
            transactions: [],
            transactionsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            receiptsRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
            logsBloom: '0x'
        };

        // Distinct from `expectedBlock.stateRoot`/`receiptsRoot` above, to prove the raw RPC value is preferred.
        const expectedReceiptsRoot = '0x1111111111111111111111111111111111111111111111111111111111111111';

        sinon.replace(provider, 'getBlock', sinon.fake.resolves(expectedBlock));
        sinon.replace(provider, 'send', sinon.fake.resolves({ size: '0x220', receiptsRoot: expectedReceiptsRoot }));

        const block = await rskTransactionHelper.getBlock(blockHash);

        assert.isTrue(provider.getBlock.calledWith(blockHash), `Was not called with expected block hash param`);

        assert.equal(block.hash, blockHash, 'The block hash is not as expected');

        assert.equal(block.size, 544, 'The block size is not as expected');

        assert.equal(block.receiptsRoot, expectedReceiptsRoot, 'The block receiptsRoot should come from the raw RPC response, not fall back to stateRoot');

        assert.isTrue(provider.send.calledWith('eth_getBlockByHash', [blockHash, false]), 'Was not called with expected block hash param');

    });

    it('should throw a clear error if the requested block does not exist', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const blockNumber = 999999999;

        sinon.replace(provider, 'getBlock', sinon.fake.resolves(null));

        await chai.expect(rskTransactionHelper.getBlock(blockNumber)).to.eventually.be.rejectedWith(Error, `Block not found: ${blockNumber}`);

    });

    it(`should import account with the provided private key and return the address`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const privateKey = '0x4c8f18581c0167eb90a761b4a304e009b924f03b619a0c0e8ea3adfce20aee64';
        const expectedAddress = '0xe9f5e6d433316e4abfeff8c40ac405b735129501';

        sinon.replace(provider, 'send', sinon.fake.resolves(expectedAddress));

        const actualAddress = await rskTransactionHelper.importAccount(privateKey);

        assert.isTrue(provider.send.calledWith('personal_importRawKey', [privateKey, '']), `Was not called with expected private key param`);

        assert.equal(expectedAddress, actualAddress, 'The address is not as expected');

    });

    it(`should unlock the account`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const accountAddress = '0xe9f5e6d433316e4abfeff8c40ac405b735129501';

        sinon.replace(provider, 'send', sinon.fake.resolves(true));

        const unlocked = await rskTransactionHelper.unlockAccount(accountAddress);

        assert.isTrue(provider.send.calledWith('personal_unlockAccount', [accountAddress, '']), `Was not called with expected account address param`);

        assert.isTrue(unlocked, 'The account was not unlocked');

    });

    it('should return false when the account could not be unlocked', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const accountAddress = '0xe9f5e6d433316e4abfeff8c40ac405b735129501';

        sinon.replace(provider, 'send', sinon.fake.resolves(false));

        const unlocked = await rskTransactionHelper.unlockAccount(accountAddress);

        assert.isFalse(unlocked, 'The account should not have been unlocked');

    });

    it('should send a transaction and return the transaction hash', async () => {
            
        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const transactionHash = '0x053a9e84bd5eae90834da13fa25af17307b405d6eb3f3dd34a31450a7067c76b';

        const transaction = {
            from: '0xe9f5e6d433316e4abfeff8c40ac405b735129501',
            to: '0x4c8f18581c0167eb90a761b4a304e009b924f03b619a0c0e8ea3adfce20aee64',
            // A value this large only fits safely in a string or bigint; a plain JS number would lose precision.
            value: '1000000000000000000',
            gas: 21000,
            gasPrice: 100000000000,
        };

        sinon.replace(provider, 'send', sinon.fake.resolves(transactionHash));

        const actualTransactionHash = await rskTransactionHelper.sendTransaction(transaction);

        // The JSON-RPC spec expects quantity fields as hex-encoded strings, so `sendTransaction` normalizes them
        // before forwarding to the node instead of sending the raw decimal values as-is.
        assert.isTrue(provider.send.calledWith('eth_sendTransaction', [{
            from: transaction.from,
            to: transaction.to,
            value: '0xde0b6b3a7640000',
            gas: '0x5208',
            gasPrice: '0x174876e800',
        }]), `Was not called with the expected normalized transaction param`);

        assert.equal(transactionHash, actualTransactionHash, 'The transaction hash is not as expected');

    });

    it('should send a transaction with an already hex-encoded value without modifying it', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const provider = rskTransactionHelper.getClient();

        const transactionHash = '0x053a9e84bd5eae90834da13fa25af17307b405d6eb3f3dd34a31450a7067c76b';

        const transaction = {
            from: '0xe9f5e6d433316e4abfeff8c40ac405b735129501',
            to: '0x4c8f18581c0167eb90a761b4a304e009b924f03b619a0c0e8ea3adfce20aee64',
            value: '0xde0b6b3a7640000',
            data: '0x',
        };

        sinon.replace(provider, 'send', sinon.fake.resolves(transactionHash));

        await rskTransactionHelper.sendTransaction(transaction);

        assert.isTrue(provider.send.calledWith('eth_sendTransaction', [{
            from: transaction.from,
            to: transaction.to,
            value: '0xde0b6b3a7640000',
            data: '0x',
        }]), `Was not called with the expected normalized transaction param`);

    });

});
