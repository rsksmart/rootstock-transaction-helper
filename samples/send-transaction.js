const RskTransactionHelper = require('../rsk-transaction-helper');

(async () => {
    const config = {
        hostUrl: process.argv[2] || 'http://localhost:4444',
    };
    
    const rskTxHelper = new RskTransactionHelper(config);
    const recipient = '0xe6dae024a76a42f13e6b92241d3802b465e55c1a';

    console.log('Current balance: ', (await rskTxHelper.getBalance(recipient)).toNumber());

    console.log('Transaction hash: ',
        await rskTxHelper.transferFundsCheckingBalance(
            '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826',
            'c85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4',
            recipient,
            1000000000
        )
    );

    // Wait 2 seconds for block to be mined
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('New Balance: ', (await rskTxHelper.getBalance(recipient)).toNumber());
})();
