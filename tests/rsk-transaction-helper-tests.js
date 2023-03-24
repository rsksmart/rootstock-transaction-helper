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

const increaseTimeResultMock = { jsonrpc: '2.0', id: 1671590107425, result: '0x1' };
const mineResultMock = { jsonrpc: '2.0', id: 1671590107426, result: null };
const newAccountWithSeedMock = { jsonrpc: '2.0', id: 1671590107426, result: '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826' };
const updateBridgeMock = { jsonrpc: '2.0', id: 1671590107427, result: null };

const TRANSFER_GAS_COST = 21000;

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

        currentProviderSendStub.onCall(0).callsArgWith(1, 'error', null);
        
        const minePromise = rskTransactionHelper.mine();

        await chai.expect(minePromise).to.eventually.be.rejectedWith('error');

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
        currentProviderSendStub.onCall(1).callsArgWith(1, 'error', null);
        
        const minePromise = rskTransactionHelper.mine();

        await chai.expect(minePromise).to.eventually.be.rejectedWith('error');

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
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;
        const expectedTxHash = '0x5729dbdf533d580d6e3510d38b704e4295b5523d8f9e0d13b601e2ba04579364';

        const emitter = new EventEmitter();

        sinon.replace(web3Client.eth, 'sendSignedTransaction', sinon.fake.returns(emitter));
        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.returns(5));
        sinon.replace(web3Client.eth.net, 'getId', sinon.fake.returns(33));
        const serializedTxHex = '0xf865058203e882520894e6dae024a76a42f13e6b92241d3802b465e55c1a843b9aca00801ca07d7ef090470ae6ac7e18ea9f1d298da325d53b13b4c342577f358868cf17a68ca05d1305ccd7940ab13bcc84144480a5821a4d677a4f2f52af310ee940bc579d64';

        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';
        const value = 1000000000;

        const promise = rskTransactionHelper.transferFunds(senderAddress, senderPrivateKey, recipient, value, expectedGasPrice);

        // Deferring the call and allowing enough time for `emitter.once('transactionHash')` to be invoked before emitting.
        await new Promise(resolve => setTimeout(resolve, 500));

        // `eventWasEmitted` will be true if a call to `emitter.once('transactionHash')` was done.
        const eventWasEmitted = emitter.emit('transactionHash', expectedTxHash);
        assert.isTrue(eventWasEmitted, '"transactionHash" event was not emitted');

        const result = await promise;

        assert.equal(result, expectedTxHash, "Transaction hash is not as expected");

        assert.isTrue(web3Client.eth.sendSignedTransaction.calledWithMatch(serializedTxHex), 'sendSignedTransaction was not called with expected data');

    });

    it('should throw exception while trying to transfer funds', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.rejects('Error getting transaction count'));

        const expectedGasPrice = 1000;
        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';
        const value = 1000000000;

        const transferFundsPromise = rskTransactionHelper.transferFunds(senderAddress, senderPrivateKey, recipient, value, expectedGasPrice);

        await chai.expect(transferFundsPromise).to.eventually.be.rejectedWith(RskTransactionHelperError, 'Error on transferFunds');

    });

    it('should transfer funds checking balance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = '999999999999999999997958000000';
        const expectedGasPrice = '1000';
        const expectedTxHash = '0x5729dbdf533d580d6e3510d38b704e4295b5523d8f9e0d13b601e2ba04579364';

        const emitter = new EventEmitter();

        sinon.replace(web3Client.eth, 'sendSignedTransaction', sinon.fake.returns(emitter));
        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));
        sinon.replace(web3Client.eth, 'getGasPrice', sinon.fake.returns(expectedGasPrice));
        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.returns(5));
        sinon.replace(web3Client.eth.net, 'getId', sinon.fake.returns(33));
        const serializedTxHex = '0xf865058203e882520894e6dae024a76a42f13e6b92241d3802b465e55c1a843b9aca00801ca07d7ef090470ae6ac7e18ea9f1d298da325d53b13b4c342577f358868cf17a68ca05d1305ccd7940ab13bcc84144480a5821a4d677a4f2f52af310ee940bc579d64';

        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';
        const value = 1000000000;

        const promise = rskTransactionHelper.transferFundsCheckingBalance(senderAddress, senderPrivateKey, recipient, value);

        // Deferring the call and allowing enough time for `emitter.once('transactionHash')` to be invoked before emitting.
        await new Promise(resolve => setTimeout(resolve, 500));

        // `eventWasEmitted` will be true if a call to `emitter.once('transactionHash')` was done.
        const eventWasEmitted = emitter.emit('transactionHash', expectedTxHash);
        assert.isTrue(eventWasEmitted, '"transactionHash" event was not emitted');

        const result = await promise;

        assert.equal(result, expectedTxHash, "Transaction hash is not as expected");

        assert.isTrue(web3Client.eth.sendSignedTransaction.calledWithMatch(serializedTxHex), 'sendSignedTransaction was not called with expected data');

    });

    it('should sign and send transaction', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedGasPrice = 1000;
        const expectedGasLimit = TRANSFER_GAS_COST;
        const expectedTxHash = '0x5729dbdf533d580d6e3510d38b704e4295b5523d8f9e0d13b601e2ba04579364';

        const emitter = new EventEmitter();

        const fakeSendSignedTransaction = sinon.fake;

        fakeSendSignedTransaction.returns(emitter);

        sinon.replace(web3Client.eth, 'sendSignedTransaction', sinon.fake.returns(emitter));
        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.returns(5));
        sinon.replace(web3Client.eth.net, 'getId', sinon.fake.returns(33));
        const serializedTxHex = '0xf865058203e882520894e6dae024a76a42f13e6b92241d3802b465e55c1a843b9aca00801ca07d7ef090470ae6ac7e18ea9f1d298da325d53b13b4c342577f358868cf17a68ca05d1305ccd7940ab13bcc84144480a5821a4d677a4f2f52af310ee940bc579d64';

        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';
        const value = 1000000000;

        const promise = rskTransactionHelper.signAndSendTransaction(senderAddress, senderPrivateKey, expectedGasPrice, expectedGasLimit, recipient, '0x', value);

        // Deferring the call and allowing enough time for `emitter.once('transactionHash')` to be invoked before emitting.
        await new Promise(resolve => setTimeout(resolve, 500));

        // `eventWasEmitted` will be true if a call to `emitter.once('transactionHash')` was done.
        const eventWasEmitted = emitter.emit('transactionHash', expectedTxHash);
        assert.isTrue(eventWasEmitted, '"transactionHash" event was not emitted');

        const result = await promise;

        assert.equal(result, expectedTxHash, "Transaction hash is not as expected");

        assert.isTrue(web3Client.eth.sendSignedTransaction.calledWithMatch(serializedTxHex), 'sendSignedTransaction was not called with expected data');

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
        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';
        const bridgeContract = new web3Client.eth.Contract(minimalBridgeAbi, bridgeAddress);
        const expectedGasLimit = web3Client.utils.toBN(1357);

        const checkBalanceForCallResponseMock = {
            estimatedGas: web3Client.utils.toBN(expectedEstimatedGas),
            requiredBalance: web3Client.utils.toBN(expectedRequiredBalance),
            callerBalance: web3Client.utils.toBN(expectedBalance),
            isEnough: true,
            gasPrice: web3Client.utils.toBN(expectedGasPrice)
        };

        sinon.replace(rskTransactionHelper, 'checkBalanceForCall', sinon.fake.returns(checkBalanceForCallResponseMock));
        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));
        sinon.replace(web3Client.eth, 'getGasPrice', sinon.fake.returns(expectedGasPrice));

        // This `signAndSendTransaction` was already tested in previous tests. No need to test it again indirectly.
        sinon.stub(rskTransactionHelper, 'signAndSendTransaction');

        const call = bridgeContract.methods.getStateForDebugging();

        await rskTransactionHelper.signAndSendTransactionCheckingBalance(call, senderAddress, senderPrivateKey, recipient);

        const calledWithExpectedParameters = rskTransactionHelper.signAndSendTransaction.calledWith(senderAddress, senderPrivateKey, checkBalanceForCallResponseMock.gasPrice, expectedGasLimit, recipient, getStateForDebuggingSelector);

        assert.isTrue(calledWithExpectedParameters, '`signAndSendTransaction` is called with expected parameters');

    });

    it('should return tx receipt', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedTxHash = '0x5729dbdf533d580d6e3510d38b704e4295b5523d8f9e0d13b601e2ba04579364';

        const expectedTxReceipt = {
            status: true,
            transactionHash: expectedTxHash,
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

        const txReceipt = await rskTransactionHelper.getTxReceipt(expectedTxHash);

        assert.isTrue(web3Client.eth.getTransactionReceipt.calledWith(expectedTxHash), 'Was not called with expected txHash');
        
        assert.equal(txReceipt, expectedTxReceipt, 'tx receipts should be the same');

    });

    it('should add "http://" to host', () => {

        const expectedHost = 'http://localhost:4444';

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: 'localhost:4444'
        });

        assert.equal(rskTransactionHelper.getClient().currentProvider.host, expectedHost, 'Host should be as expected, prepended with http://');

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
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        sinon.replace(web3Client.eth, 'getTransactionCount', sinon.fake.rejects('Error getting transaction count'));

        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';
        const value = 1000000000;
        const expectedGasPrice = 1000;
        const expectedGasLimit = TRANSFER_GAS_COST;

        const signAndSendTransactionPromise = rskTransactionHelper.signAndSendTransaction(senderAddress, senderPrivateKey, expectedGasPrice, expectedGasLimit, recipient, '0x', value);

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
        
        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';

        const checkBalanceForCallResponseMock = {
            estimatedGas: web3Client.utils.toBN(expectedEstimatedGas),
            requiredBalance: web3Client.utils.toBN(expectedRequiredBalance),
            callerBalance: web3Client.utils.toBN(expectedBalance),
            isEnough: false,
            gasPrice: web3Client.utils.toBN(expectedGasPrice)
        };

        sinon.replace(rskTransactionHelper, 'checkBalanceForCall', sinon.fake.returns(checkBalanceForCallResponseMock));
       
        const signAndSendTransactionCheckingBalancePromise = rskTransactionHelper.signAndSendTransactionCheckingBalance({}, senderAddress, senderPrivateKey, recipient);

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

        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';
        const value = 1000000000;

        const transferFundsCheckingBalancePromise = rskTransactionHelper.transferFundsCheckingBalance(senderAddress, senderPrivateKey, recipient, value);

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

        currentProviderSendStub.onCall(0).callsArgWith(1, 'error', null);

        const seed = 'seed';
        
        await chai.expect(rskTransactionHelper.newAccountWithSeed(seed)).to.eventually.be.rejectedWith('error');

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

        currentProviderSendStub.onCall(0).callsArgWith(1, 'error', null);
        
        await chai.expect(rskTransactionHelper.updateBridge()).to.eventually.be.rejectedWith('error');

    });

});
