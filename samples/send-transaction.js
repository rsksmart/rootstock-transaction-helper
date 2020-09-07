let RskTransactionHelper = require('../rsk-transaction-helper');
let web3 = require('web3');

(async () => {
    let config = {
        hostUrl: 'http://localhost:4444'
    };
    let rskTxHelper = new RskTransactionHelper(config);
    let web3Client = new web3(config.hostUrl);

    let recipient = "0xe6dae024a76a42f13e6b92241d3802b465e55c1a";

    console.log(await web3Client.eth.getBalance(recipient));

    console.log(
        await rskTxHelper.transferFundsCheckingBalance(
            '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826',
            "c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4",
            recipient,
            1000000000
        )
    );

    // Wait 2 seconds for block to be mined
    await new Promise((r) => setTimeout(r, 2000));

    console.log(await web3Client.eth.getBalance(recipient));
})();
