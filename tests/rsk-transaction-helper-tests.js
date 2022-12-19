const { assert } = require('chai');
const sinon = require('sinon');
const { RskTransactionHelperBuilder } = require('../rsk-transaction-helper');
const Web3 = require('web3');
const EventEmitter = require('events').EventEmitter;

// No actual use of this host is being done. No need to have a node running on that host.
const PROVIDER_URL = 'http://localhost:4444';

describe('RskTransactionHelper tests', () => {

    const sandbox = sinon.createSandbox();

    after(() => {
        sandbox.restore();
    });

    it('Mines block as expected', async () => {
        
        const rskTransactionHelperBuilder = new RskTransactionHelperBuilder();
        const web3Client = new Web3(PROVIDER_URL);
        sinon.replace(web3Client.currentProvider, 'send', sinon.fake());
        rskTransactionHelperBuilder.withWeb3Client(web3Client);
        const rskTransactionHelper = rskTransactionHelperBuilder.build();

        await rskTransactionHelper.mine();

        assert.isTrue(web3Client.currentProvider.send.calledTwice);

        const firstToEvmIncreaseTime = web3Client.currentProvider.send.getCall(0);
        const secondCallToEvnMine = web3Client.currentProvider.send.getCall(1);

        assert.equal(firstToEvmIncreaseTime.args[0].method, 'evm_increaseTime', 'First call has to be to `evm_increaseTime`');
        assert.equal(secondCallToEvnMine.args[0].method, 'evm_mine', 'Second call has to be to `evm_mine`');

        assert.equal(firstToEvmIncreaseTime.args[0].params[0], 1, 'Increase time param is 1');

        assert.notEqual(firstToEvmIncreaseTime.args[0].id, secondCallToEvnMine.args[0].id, 'Both calls ids should be different');

        assert.equal(firstToEvmIncreaseTime.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for first call is `2.0`');
        assert.equal(secondCallToEvnMine.args[0].jsonrpc, '2.0', 'Expected jsonrpc version for second call is `2.0`');

    });

    it('should extend the web3 client dynamically', () => {

        const rskTransactionHelperBuilder = new RskTransactionHelperBuilder();
        const web3Client = new Web3(PROVIDER_URL);
        sinon.replace(web3Client, 'extend', sinon.fake());
        rskTransactionHelperBuilder.withWeb3Client(web3Client);
        const rskTransactionHelper = rskTransactionHelperBuilder.build();

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
        const rskTransactionHelperBuilder = new RskTransactionHelperBuilder();
        const web3Client = new Web3(PROVIDER_URL);
        rskTransactionHelperBuilder.withWeb3Client(web3Client);
        const rskTransactionHelper = rskTransactionHelperBuilder.build();

        assert.equal(rskTransactionHelper.getClient(), web3Client);

    });

    it('should return the balance', async () => {
        const rskTransactionHelperBuilder = new RskTransactionHelperBuilder();
        const web3Client = new Web3(PROVIDER_URL);
        rskTransactionHelperBuilder.withWeb3Client(web3Client);
        const rskTransactionHelper = rskTransactionHelperBuilder.build();

        const expectedBalance = 99999;

        sinon.replace(web3Client.eth, 'getBalance', sinon.fake.returns(expectedBalance));

        const balance = await rskTransactionHelper.getBalance();

        assert.equal(balance, expectedBalance);

    });

    it('should transfer funds', async () => {

        const rskTransactionHelperBuilder = new RskTransactionHelperBuilder();
        const web3Client = new Web3(PROVIDER_URL);

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

        rskTransactionHelperBuilder.withWeb3Client(web3Client);
        const rskTransactionHelper = rskTransactionHelperBuilder.build();

        const senderAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
        const senderPrivateKey = 'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4';
        const recipient = "0xe6dae024a76a42f13e6b92241d3802b465e55c1a";
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