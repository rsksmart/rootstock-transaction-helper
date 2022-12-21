const { assert } = require('chai');
const sinon = require('sinon');
const RskTransactionHelper = require('../rsk-transaction-helper');

const EventEmitter = require('events').EventEmitter;

// No actual use of this host is being done in these unit tests. No need to have a node running on that host.
const PROVIDER_URL = 'http://localhost:4450';

const increaseTimeResultMock = { jsonrpc: '2.0', id: 1671590107425, result: '0x1' };
const mineResultMock = { jsonrpc: '2.0', id: 1671590107426, result: null };

describe('RskTransactionHelper tests', () => {

    it('should mine 1 block as expected', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();
        
        const currentProviderSendStub = sinon.stub(web3Client.currentProvider, 'send');

        currentProviderSendStub.onCall(0).callsArgWith(1, null, increaseTimeResultMock);
        currentProviderSendStub.onCall(1).callsArgWith(1, null, mineResultMock);
        
        await rskTransactionHelper.mine();

        assert.isTrue(web3Client.currentProvider.send.calledTwice);

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
        sinon.assert.callCount(currentProviderSendStub, 4);

    });

    it('should extend the web3 client dynamically', () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        sinon.replace(web3Client, 'extend', sinon.fake());

        const extensionObject = {
            property: 'personal',
            methods: [{
              name: 'newAccountWithSeed',
              call: 'personal_newAccountWithSeed',
              params: 1
            }]
          };

        rskTransactionHelper.extendClient(extensionObject);

        assert.isTrue(web3Client.extend.calledOnce, 'web3Client.extend should be called once');

        assert.deepEqual(web3Client.extend.getCall(0).args[0], extensionObject, 'Arguments should be the same');

    });

    it('should return client', () => {
        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        assert.equal(rskTransactionHelper.getClient(), web3Client);

    });

    it('should return the balance', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = 99999;

        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));

        const balance = await rskTransactionHelper.getBalance();

        assert.equal(balance, expectedBalance);

    });

    it('should transfer funds', async () => {

        const rskTransactionHelper = new RskTransactionHelper({
            hostUrl: PROVIDER_URL
        });

        const web3Client = rskTransactionHelper.getClient();

        const expectedBalance = '999999999999999999997958000000';
        const expectedGasPrice = '1000';
        const expectedTxHash = '0x5729dbdf533d580d6e3510d38b704e4295b5523d8f9e0d13b601e2ba04579364';

        const emitter = new EventEmitter();

        const fakeSendSignedTransaction = sinon.fake;

        fakeSendSignedTransaction.returns(emitter);

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
        assert.isTrue(eventWasEmitted);

        const result = await promise;

        assert.equal(result, expectedTxHash);

        assert.isTrue(web3Client.eth.sendSignedTransaction.calledWithMatch(serializedTxHex), 'sendSignedTransaction was not called with expected data');

    });

});
