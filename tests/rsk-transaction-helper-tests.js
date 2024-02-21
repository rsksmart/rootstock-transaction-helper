const chai = require('chai');
const sinon = require('sinon');
const RskTransactionHelper = require('../rsk-transaction-helper');
const RskTransactionHelperError = require('../rsk-transaction-helper-error');
const chaiAsPromise = require('chai-as-promised');
chai.use(chaiAsPromise);
const assert = chai.assert;
const rewire = require('rewire');

const EventEmitter = require('events').EventEmitter;

// No actual call to this host is being made, but it's needed for the `currentProvider` object to be created.
const PROVIDER_URL = 'http://localhost:4444';

const TEST_SENDER_ADDRESS = '0x0671fcbf6c14b08a18cb8db6e5345efaecb907c4';
const TEST_RECIPIENT_ADDRESS = '0xcfc833ca1ebb1d4fe19230585a601d0b392eeed7';
const TEST_TX_HASH = '0x49ea2e86436430232d69e3ef21ae08d111a4f23d666f8f3e8735b1ef5bda87b0';
const TEST_PRIVATE_KEY = 'b7ddc1c73a0f94479ec44c814d57aec904865dfa1e3487ec8c648ee7fb2daf3c';
const TEST_SERIALIZED_TX_HEX = 'f865058203e882520894cfc833ca1ebb1d4fe19230585a601d0b392eeed7843b9aca00801ba0010d207e7f109c1ebd9b934a3c5dc2c126280050b3c4902a7f2a0b0628e87596a01bbbd3ec2e80dc9000fa5738c3458b3ff58701757c52c24c2994ed2fde547a69';

const increaseTimeResultMock = { jsonrpc: '2.0', id: 1671590107425, result: '0x1' };
const mineResultMock = { jsonrpc: '2.0', id: 1671590107426, result: null };
const newAccountWithSeedMock = { jsonrpc: '2.0', id: 1671590107426, result: TEST_SENDER_ADDRESS };
const updateBridgeMock = { jsonrpc: '2.0', id: 1671590107427, result: null };

const TRANSFER_GAS_COST = 21000;

const nonConnectionErrorMock = {
    message: 'A different error',
};

const connectionErrorMock = {
    message: `CONNECTION ERROR: Couldn't connect to node`,
};

describe('RskTransactionHelper tests', () => {

    it('should fail constructing the Web3 instance', () => {

        const RskTransactionHelper = rewire('../rsk-transaction-helper');
        class Web3Mock {
            constructor() {
                throw new Error('Web3 creation error');
            }
        }
        RskTransactionHelper.__set__('Web3', Web3Mock);

        assert.throws(() => {
            new RskTransactionHelper({
                hostUrl: PROVIDER_URL
            });
        }, 'Error creating Web3 client');

    });

    it('should mine 1 block as expected', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, null, increaseTimeResultMock);
        currentProviderSendStub.onCall(1).callsArgWith(1, null, mineResultMock);
        
        await rskTransactionHelper.mine();

        assert.isTrue(web3Client.currentProvider.send.calledTwice, '`currentProvider.send` method was not called twice');

        const evmIncreaseTimeCall = web3Client.currentProvider.send.getCall(0);
        const evmMineCall = web3Client.currentProvider.send.getCall(1);

        assert.equal(evmIncreaseTimeCall.args[0].method, 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');
        assert.equal(evmMineCall.args[0].method, 'evm_mine', 'Second call has to be to `evm_mine`');

        assert.equal(evmIncreaseTimeCall.args[0].params[0], 60000, 'Increase time param is 6000 milliseconds, which is a minute');

        assert.notEqual(evmIncreaseTimeCall.args[0].id, evmMineCall.args[0].id, 'Both calls ids should be different');

        assert.equal(evmIncreaseTimeCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for first call is `2.0`');
        assert.equal(evmMineCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for second call is `2.0`');

    });

    it('should mine multiple blocks (2) as expected', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();
        
        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');
        
        currentProviderSendStub.onCall(0).callsArgWith(1, null, increaseTimeResultMock);
        currentProviderSendStub.onCall(1).callsArgWith(1, null, mineResultMock);
        currentProviderSendStub.onCall(2).callsArgWith(1, null, increaseTimeResultMock);
        currentProviderSendStub.onCall(3).callsArgWith(1, null, increaseTimeResultMock);
        
        await rskTransactionHelper.mine(2);

        // 2 times for evm_increaseTime, 2 times for evm_mine
        sinon.assert.callCount(currentProviderSendStub, 4, 'currentProvider.send method should be called 4 times');

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

        const web3Client = rskTransactionHelper.getClient();

        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, nonConnectionErrorMock, null);
        
        const minePromise = rskTransactionHelper.mine();

        await chai.expect(minePromise).to.eventually.be.rejectedWith(nonConnectionErrorMock);

        assert.isTrue(web3Client.currentProvider.send.calledOnce, '`currentProvider.send` method was not called once');

        const evmIncreaseTimeCall = web3Client.currentProvider.send.getCall(0);

        assert.equal(evmIncreaseTimeCall.args[0].method, 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');

        assert.equal(evmIncreaseTimeCall.args[0].params[0], 60000, 'Increase time param is 6000 milliseconds, which is a minute');

        assert.equal(evmIncreaseTimeCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for first call is `2.0`');

    });

    it('should fail when the call to `evm_mine` fails while trying to mine', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, null, increaseTimeResultMock);
        currentProviderSendStub.onCall(1).callsArgWith(1, nonConnectionErrorMock, null);
        
        const minePromise = rskTransactionHelper.mine();

        await chai.expect(minePromise).to.eventually.be.rejectedWith(nonConnectionErrorMock);

        assert.isTrue(web3Client.currentProvider.send.calledTwice, '`currentProvider.send` method was not called once');

        const evmIncreaseTimeCall = web3Client.currentProvider.send.getCall(0);
        const evmMineCall = web3Client.currentProvider.send.getCall(1);

        assert.equal(evmIncreaseTimeCall.args[0].method, 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');
        assert.equal(evmMineCall.args[0].method, 'evm_mine', 'Second call has to be to `evm_mine`');

        assert.equal(evmIncreaseTimeCall.args[0].params[0], 60000, 'Increase time param is 6000 milliseconds, which is a minute');

        assert.notEqual(evmIncreaseTimeCall.args[0].id, evmMineCall.args[0].id, 'Both calls ids should be different');

        assert.equal(evmIncreaseTimeCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for first call is `2.0`');
        assert.equal(evmMineCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for second call is `2.0`');

    });

    it('should return client', () => {
        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        assert.equal(rskTransactionHelper.getClient(), web3Client, 'Web3 client should be as expected');

    });

    it('should return the latest block number', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBlockNumber = 20;

        sinon.replace(web3Client.eth, 'getBlockNumber', sinon.fake.returns(expectedBlockNumber));

        const blockNumber = await rskTransactionHelper.getBlockNumber();

        assert.equal(blockNumber, expectedBlockNumber, '`blockNumber` is not as expected');

    })

    it('should return the balance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = 99999;

        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));

        const balance = await rskTransactionHelper.getBalance();

        assert.equal(balance, expectedBalance, 'The balance is not as expected');

    });

    it('should return the gas price', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;

        sinon.replace(web3Client.eth, 'getGasPrice', sinon.fake.returns(expectedGasPrice));

        const gasPrice = await rskTransactionHelper.getGasPrice();

        assert.equal(gasPrice, expectedGasPrice, 'The gas price is not as expected');

    });

    it('should return the default 1 gas price', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedGasPrice = 1;

        sinon.replace(web3Client.eth, 'getGasPrice', sinon.fake.returns(0));

        const gasPrice = await rskTransactionHelper.getGasPrice();

        assert.equal(gasPrice, expectedGasPrice, 'The gas price is not as expected');

    });

    it('should transfer funds', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;

        const emitter = new EventEmitter();

        sinon.replace(web3Client.eth, 'sendSignedTransaction', sinon.fake.returns(emitter));
        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.returns(5));

        const senderPrivateKey = 'b7ddc1c73a0f94479ec44c814d57aec904865dfa1e3487ec8c648ee7fb2daf3c';
        const value = 1000000000;

        const promise = rskTransactionHelper.transferFunds(TEST_SENDER_ADDRESS, senderPrivateKey, TEST_RECIPIENT_ADDRESS, value, { gasPrice: expectedGasPrice });

        // Deferring the call and allowing enough time for `emitter.once('transactionHash')` to be invoked before emitting.
        await new Promise(resolve => setTimeout(resolve, 500));

        // `eventWasEmitted` will be true if a call to `emitter.once('transactionHash')` was done.
        const eventWasEmitted = emitter.emit('transactionHash', TEST_TX_HASH);
        assert.isTrue(eventWasEmitted, '"transactionHash" event was not emitted');

        const result = await promise;

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

        assert.isTrue(web3Client.eth.sendSignedTransaction.calledWithMatch(TEST_SERIALIZED_TX_HEX), 'sendSignedTransaction was not called with expected data');

    });

    it('should fail to transfer funds when chainId is not provided', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const expectedGasPrice = 1000;

        const value = 1000000000;

        await chai.expect(
            rskTransactionHelper.transferFunds(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value, expectedGasPrice)
        ).to.eventually.be.rejectedWith('chainId not provided');

    });

    it('should throw exception while trying to transfer funds', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const web3Client = rskTransactionHelper.getClient();

        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.rejects('Error getting transaction count'));

        const expectedGasPrice = 1000;
        const value = 1000000000;

        const transferFundsPromise = rskTransactionHelper.transferFunds(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value, expectedGasPrice);

        await chai.expect(transferFundsPromise).to.eventually.be.rejectedWith('Error getting transaction count');

    });

    it('should transfer funds checking balance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = '999999999999999999997958000000';
        const expectedGasPrice = '1000';

        const emitter = new EventEmitter();

        sinon.replace(web3Client.eth, 'sendSignedTransaction', sinon.fake.returns(emitter));
        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));
        sinon.replace(web3Client.eth, 'getGasPrice', sinon.fake.returns(expectedGasPrice));
        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.returns(5));

        const value = 1000000000;

        const promise = rskTransactionHelper.transferFundsCheckingBalance(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value);

        // Deferring the call and allowing enough time for `emitter.once('transactionHash')` to be invoked before emitting.
        await new Promise(resolve => setTimeout(resolve, 500));

        // `eventWasEmitted` will be true if a call to `emitter.once('transactionHash')` was done.
        const eventWasEmitted = emitter.emit('transactionHash', TEST_TX_HASH);
        assert.isTrue(eventWasEmitted, '"transactionHash" event was not emitted');

        const result = await promise;

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

        assert.isTrue(web3Client.eth.sendSignedTransaction.calledWithMatch(TEST_SERIALIZED_TX_HEX), 'sendSignedTransaction was not called with expected data');

    });

    it('should sign and send transaction', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;
        const expectedGasLimit = TRANSFER_GAS_COST;

        const emitter = new EventEmitter();

        const fakeSendSignedTransaction = sinon.fake;

        fakeSendSignedTransaction.returns(emitter);

        sinon.replace(web3Client.eth, 'sendSignedTransaction', sinon.fake.returns(emitter));
        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.returns(5));

        const value = 1000000000;

        const promise = rskTransactionHelper.signAndSendTransaction(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, '0x', value, {
            gasPrice: expectedGasPrice,
            gasLimit: expectedGasLimit
        });

        // Deferring the call and allowing enough time for `emitter.once('transactionHash')` to be invoked before emitting.
        await new Promise(resolve => setTimeout(resolve, 500));

        // `eventWasEmitted` will be true if a call to `emitter.once('transactionHash')` was done.
        const eventWasEmitted = emitter.emit('transactionHash', TEST_TX_HASH);
        assert.isTrue(eventWasEmitted, '"transactionHash" event was not emitted');

        const result = await promise;

        assert.equal(result, TEST_TX_HASH, "Transaction hash is not as expected");

        assert.isTrue(web3Client.eth.sendSignedTransaction.calledWithMatch(TEST_SERIALIZED_TX_HEX), 'sendSignedTransaction was not called with expected data');

    });

    it('should fail to sign and send transaction if chainId is not provided', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
        });

        const expectedGasPrice = 1000;
        const expectedGasLimit = TRANSFER_GAS_COST;
   
        const emitter = new EventEmitter();

        const fakeSendSignedTransaction = sinon.fake;

        fakeSendSignedTransaction.returns(emitter);

        const value = 1000000000;

        await chai.expect(
            rskTransactionHelper.signAndSendTransaction(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, expectedGasPrice, expectedGasLimit, TEST_RECIPIENT_ADDRESS, '0x', value)
        ).to.eventually.be.rejectedWith('chainId not provided');

    });

    it('should check balance for contract method call', async () => {

        const minimalBridgeAbi = [
            {
              "name": "getStateForDebugging",
              "type": "function",
              "constant": "true",
              "inputs": [],
              "outputs": [
                {
                  "name": "",
                  "type": "bytes"
                }
              ]
            }
        ];

        const bridgeAddress = '0x0000000000000000000000000000000001000006';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = 9999999;
        const expectedGasPrice = 1000;
        const expectedEstimatedGas = 1234;
        const expectedRequiredBalance = expectedGasPrice * expectedEstimatedGas;

        const bridgeContract = new web3Client.eth.Contract(minimalBridgeAbi, bridgeAddress);

        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));
        sinon.replace(web3Client.eth, 'getGasPrice', sinon.fake.returns(expectedGasPrice));

        const estimateGasMockFunction = () => {
            return {
                estimateGas: () => expectedEstimatedGas
            };
        }

        sinon.replace(bridgeContract.methods, 'getStateForDebugging', estimateGasMockFunction);

        const result = await rskTransactionHelper.checkBalanceForCall(bridgeContract.methods.getStateForDebugging(), bridgeAddress);

        assert.equal(result.estimatedGas, expectedEstimatedGas, 'Resulting estimated gas is as expected');
        assert.equal(result.requiredBalance, expectedRequiredBalance, 'Resulting required balance is as expected');
        assert.equal(result.callerBalance, expectedBalance, 'Resulting caller balance is as expected');
        assert.equal(result.isEnough, true, 'It is enough');
        assert.equal(result.gasPrice, expectedGasPrice, 'Resulting gasPrice is as expected');

    });

    it('should sign and send transaction checking balance', async () => {

        const minimalBridgeAbi = [
            {
              "name": "getStateForDebugging",
              "type": "function",
              "constant": "true",
              "inputs": [],
              "outputs": [
                {
                  "name": "",
                  "type": "bytes"
                }
              ]
            }
        ];

        const getStateForDebuggingSelector = '0x0d0cee93';

        const bridgeAddress = '0x0000000000000000000000000000000001000006';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = 9999999;
        const expectedGasPrice = 1000;
        const expectedEstimatedGas = 1234;
        const expectedRequiredBalance = expectedGasPrice * expectedEstimatedGas;
        const bridgeContract = new web3Client.eth.Contract(minimalBridgeAbi, bridgeAddress);
        const expectedGasLimit = web3Client.utils.toBigInt(1357);

        const checkBalanceForCallResponseMock = {
            estimatedGas: web3Client.utils.toBigInt(expectedEstimatedGas),
            requiredBalance: web3Client.utils.toBigInt(expectedRequiredBalance),
            callerBalance: web3Client.utils.toBigInt(expectedBalance),
            isEnough: true,
            gasPrice: web3Client.utils.toBigInt(expectedGasPrice)
        };

        sinon.replace(rskTransactionHelper, 'checkBalanceForCall', sinon.fake.returns(checkBalanceForCallResponseMock));
        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));
        sinon.replace(web3Client.eth, 'getGasPrice', sinon.fake.returns(expectedGasPrice));

        // This `signAndSendTransaction` was already tested in previous tests. No need to test it again indirectly.
        sinon.stub(rskTransactionHelper, 'signAndSendTransaction');

        const call = bridgeContract.methods.getStateForDebugging();

        await rskTransactionHelper.signAndSendTransactionCheckingBalance(call, TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS);

        const calledWithExpectedParameters = rskTransactionHelper.signAndSendTransaction.calledWith(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, checkBalanceForCallResponseMock.gasPrice, expectedGasLimit, TEST_RECIPIENT_ADDRESS, getStateForDebuggingSelector);

        assert.isTrue(calledWithExpectedParameters, '`signAndSendTransaction` is called with expected parameters');

    });

    it('should return tx receipt', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedTxReceipt = {
            status: true,
            transactionHash: TEST_TX_HASH,
            transactionIndex: 1,
            blockHash: '',
            blockNumber: 1,
            from: '',
            to: '',
            cumulativeGasUsed: 50,
            gasUsed: 20,
            effectiveGasPrice: 1000,
            logs: [],
            logsBloom: ''
        };

        sinon.replace(web3Client.eth, 'getTransactionReceipt', sinon.fake.returns(expectedTxReceipt));

        const txReceipt = await rskTransactionHelper.getTxReceipt(TEST_TX_HASH);

        assert.isTrue(web3Client.eth.getTransactionReceipt.calledWith(TEST_TX_HASH), 'Was not called with expected txHash');
        
        assert.equal(txReceipt, expectedTxReceipt, 'tx receipts should be the same');

    });

    it('should add "http://" to host', () => {

        const expectedHost = 'http://localhost:4444';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: 'localhost:4444'
        });

        assert.equal(rskTransactionHelper.getClient().currentProvider.clientUrl, expectedHost, 'Host should be as expected, prepended with http://');

    });

    it('should fail if passed an invalid host', () => {

        assert.throws(() => {
            new RskTransactionHelper({
                hostUrl: null
            });
        }, 'Invalid host provided');

    });

    it('should throw an error while trying to sign and send transaction', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            chainId: 31
        });

        const web3Client = rskTransactionHelper.getClient();

        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.rejects('Error getting transaction count'));

        const value = 1000000000;
        const expectedGasPrice = 1000;
        const expectedGasLimit = TRANSFER_GAS_COST;

        const signAndSendTransactionPromise = rskTransactionHelper.signAndSendTransaction(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, expectedGasPrice, expectedGasLimit, TEST_RECIPIENT_ADDRESS, '0x', value);

        await chai.expect(signAndSendTransactionPromise).to.eventually.be.rejectedWith(RskTransactionHelperError, 'Error on signAndSendTransaction');

    });

    it('should fail with insufficient error', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = 9999999;
        const expectedGasPrice = 1000;
        const expectedEstimatedGas = 1234;
        const expectedRequiredBalance = expectedGasPrice * expectedEstimatedGas;

        const checkBalanceForCallResponseMock = {
            estimatedGas: web3Client.utils.toBigInt(expectedEstimatedGas),
            requiredBalance: web3Client.utils.toBigInt(expectedRequiredBalance),
            callerBalance: web3Client.utils.toBigInt(expectedBalance),
            isEnough: false,
            gasPrice: web3Client.utils.toBigInt(expectedGasPrice)
        };

        sinon.replace(rskTransactionHelper, 'checkBalanceForCall', sinon.fake.returns(checkBalanceForCallResponseMock));
       
        const signAndSendTransactionCheckingBalancePromise = rskTransactionHelper.signAndSendTransactionCheckingBalance({}, TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS);

        await chai.expect(signAndSendTransactionCheckingBalancePromise).to.eventually.be.rejectedWith(Error, 'Insufficient balance. Required: 1234000, current balance: 9999999');

    });

    it('should fail with insufficient error while checking balance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = 1;
        const expectedGasPrice = 1000;

        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));
        sinon.replace(web3Client.eth, 'getGasPrice', sinon.fake.returns(expectedGasPrice));

        const value = 1000000000;

        const transferFundsCheckingBalancePromise = rskTransactionHelper.transferFundsCheckingBalance(TEST_SENDER_ADDRESS, TEST_PRIVATE_KEY, TEST_RECIPIENT_ADDRESS, value);

        await chai.expect(transferFundsCheckingBalancePromise).to.eventually.be.rejectedWith(Error, 'Insufficient balance. Required: 1021000000, current balance: 1');

    });

    it('should create a new account with seed', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, null, newAccountWithSeedMock);

        const seed = 'seed';
        
        const newAccount = await rskTransactionHelper.newAccountWithSeed(seed);

        assert.isTrue(web3Client.currentProvider.send.calledOnce, '`currentProvider.send` method was not called once');

        const newAccountWithSeedCall = web3Client.currentProvider.send.getCall(0);

        assert.equal(newAccountWithSeedCall.args[0].method, 'personal_newAccountWithSeed', 'Method is not as expected');

        assert.equal(newAccountWithSeedCall.args[0].params[0], seed, 'Did not use the expected seed');

        assert.equal(newAccountWithSeedCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for first call is `2.0`');

        assert.equal(newAccount, newAccountWithSeedMock.result, 'Returned account address is not as expected');

    });

    it('should fail with "error" while trying to create a new account with seed', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, nonConnectionErrorMock, null);

        const seed = 'seed';
        
        await chai.expect(rskTransactionHelper.newAccountWithSeed(seed)).to.eventually.be.rejectedWith(nonConnectionErrorMock);

    });

    it('should update the bridge', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, null, updateBridgeMock);

        const updateBridgeResponse = await rskTransactionHelper.updateBridge();

        assert.isTrue(web3Client.currentProvider.send.calledOnce, '`currentProvider.updateBridge` method was not called once');

        const updateBridgeCall = web3Client.currentProvider.send.getCall(0);

        assert.equal(updateBridgeCall.args[0].method, 'fed_updateBridge', 'Expected web3 instance method was not called');

        assert.isEmpty(updateBridgeCall.args[0].params, 'Params should be empty');

        assert.equal(updateBridgeCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for first call is `2.0`');

        assert.equal(updateBridgeResponse, updateBridgeMock.result, 'Returned should be null as expected');

    });

    it('should fail with "error" while trying to call updateBridge', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, nonConnectionErrorMock, null);
        
        await chai.expect(rskTransactionHelper.updateBridge()).to.eventually.be.rejectedWith(nonConnectionErrorMock);

    });

    it('should return the balance with attempts', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            maxAttempts: 3,
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = 99999;

        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));

        const balance = await rskTransactionHelper.getBalance();

        assert.equal(balance, expectedBalance, 'The balance is not as expected');

    });

    it('should mine 1 block as expected after failing due to connection error 2 times', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL,
            maxAttempts: 3,
            attemptDelay: 100, // Using a small delay to speed up the test and avoid timeout issues.
        });

        const web3Client = rskTransactionHelper.getClient();

        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, null, increaseTimeResultMock); // evm_increaseTime
        currentProviderSendStub.onCall(1).callsArgWith(1, connectionErrorMock, null); // evm_mine

        currentProviderSendStub.onCall(2).callsArgWith(1, connectionErrorMock, null); // evm_mine

        currentProviderSendStub.onCall(3).callsArgWith(1, null, mineResultMock); // evm_mine
        
        await rskTransactionHelper.mine();

        sinon.assert.callCount(currentProviderSendStub, 4, 'currentProvider.send method should be called 6 times');

        const evmIncreaseTimeCall = web3Client.currentProvider.send.getCall(0);
        const evmMineCall = web3Client.currentProvider.send.getCall(1);

        assert.equal(evmIncreaseTimeCall.args[0].method, 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');
        assert.equal(evmMineCall.args[0].method, 'evm_mine', 'Second call has to be to `evm_mine`');

        assert.equal(evmIncreaseTimeCall.args[0].params[0], 60000, 'Increase time param is 6000 milliseconds, which is a minute');

        assert.notEqual(evmIncreaseTimeCall.args[0].id, evmMineCall.args[0].id, 'Both calls ids should be different');

        assert.equal(evmIncreaseTimeCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for first call is `2.0`');
        assert.equal(evmMineCall.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for second call is `2.0`');

    });

    it(`should return the block and be called with the 'latest' param if none specified`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBlock = { number: 5 };

        sinon.replace(web3Client.eth, 'getBlock', sinon.fake.returns(expectedBlock));

        const block = await rskTransactionHelper.getBlock();

        assert.isTrue(web3Client.eth.getBlock.calledWith('latest'), 'Was not called with expected latest param');

        assert.equal(expectedBlock, block, 'The block is not as expected');

    });

    it(`should return the block and be called with the specified block number`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const blockNumber = 5;

        const expectedBlock = { number: blockNumber };

        sinon.replace(web3Client.eth, 'getBlock', sinon.fake.returns(expectedBlock));

        const block = await rskTransactionHelper.getBlock(blockNumber);

        assert.isTrue(web3Client.eth.getBlock.calledWith(blockNumber), `Was not called with expected block number param`);

        assert.equal(expectedBlock, block, 'The block is not as expected');

    });

    it(`should return the block and be called with the specified block hash`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const blockHash = '0x053a9e84bd5eae90834da13fa25af17307b405d6eb3f3dd34a31450a7067c76b';

        const expectedBlock = {
            hash: blockHash,
            number: 5,
        };

        sinon.replace(web3Client.eth, 'getBlock', sinon.fake.returns(expectedBlock));

        const block = await rskTransactionHelper.getBlock(blockHash);

        assert.isTrue(web3Client.eth.getBlock.calledWith(blockHash), `Was not called with expected block hash param`);

        assert.equal(expectedBlock, block, 'The block is not as expected');

    });

    it(`should import account with the provided private key and return the address`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const privateKey = '0x4c8f18581c0167eb90a761b4a304e009b924f03b619a0c0e8ea3adfce20aee64';
        const expectedAddress = '0xe9f5e6d433316e4abfeff8c40ac405b735129501';

        sinon.replace(web3Client.eth.personal, 'importRawKey', sinon.fake.returns(expectedAddress));

        const actualAddress = await rskTransactionHelper.importAccount(privateKey);

        assert.isTrue(web3Client.eth.personal.importRawKey.calledWith(privateKey), `Was not called with expected private key param`);

        assert.equal(expectedAddress, actualAddress, 'The address is not as expected');

    });

    it(`should unlock the account`, async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const accountAddress = '0xe9f5e6d433316e4abfeff8c40ac405b735129501';

        sinon.replace(web3Client.eth.personal, 'unlockAccount', sinon.fake.returns(true));

        const unlocked = await rskTransactionHelper.unlockAccount(accountAddress);

        assert.isTrue(web3Client.eth.personal.unlockAccount.calledWith(accountAddress), `Was not called with expected account address param`);

        assert.isTrue(unlocked, 'The account was not unlocked');

    });

    it('should send a transaction and return the transaction hash', async () => {
            
        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const transactionHash = '0x053a9e84bd5eae90834da13fa25af17307b405d6eb3f3dd34a31450a7067c76b';

        const transaction = {
            from: '0xe9f5e6d433316e4abfeff8c40ac405b735129501',
            to: '0x4c8f18581c0167eb90a761b4a304e009b924f03b619a0c0e8ea3adfce20aee64',
            value: 1000000000000000000,
            gas: 21000,
            gasPrice: 100000000000,
        };

        sinon.replace(web3Client.eth, 'sendTransaction', sinon.fake.returns(transactionHash));

        const actualTransactionHash = await rskTransactionHelper.sendTransaction(transaction);

        assert.isTrue(web3Client.eth.sendTransaction.calledWith(transaction), `Was not called with expected transaction param`);

        assert.equal(transactionHash, actualTransactionHash, 'The transaction hash is not as expected');

    });

});
