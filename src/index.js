const TronWeb = require("tronweb");
const express = require("express");
const mongodb = require("mongodb");
const bodyParser = require("body-parser");
const dotenv = require("dotenv")
const fetch = require("node-fetch")

dotenv.config({path: __dirname + "/../.env"})

const tronWeb = new TronWeb({
    fullHost: "https://api.shasta.trongrid.io",  // mainnet
    eventServer: "https://api.shasta.trongrid.io",
    privateKey: process.env.FEES_ADDRESS_PRIVATE_KEY
});

const usdtContractAddress = "TSMmQT5yQkmJmxzRLAF7UY8UQvbGLtungz";

const app = express();
const usdtContract = tronWeb.contract().at(usdtContractAddress); // the usdt address

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }));

function db(callback) {
    mongodb.MongoClient.connect(process.env.MONGO_URL, (err, client) => {
        if(err) {
            console.log(err)
            return;
        }
        else callback(client);
    });
}

// connect to the usdt contract and track transfers

usdtContract.then(contract => {
    var transferEvent = contract.Transfer();
    transferEvent.watch((err, event) => {
        if(err)
            console.log("failed to watch")
        else {
            db(client => {
                const addresses = client.db("jk").collection("addresses");
                addresses.findOne({"address.hex": event.result.to}, async (err, dbResult) => {
                    if(err)
                        console.log(err)
                    else {
                        var contract = await usdtContract;
                        var decimals = await contract.decimals().call()
                        event.result.value /= Math.pow(10, decimals)
                        event.result.to = tronWeb.address.fromHex(event.result.to)
                        event.result.from = tronWeb.address.fromHex(event.result.from)
                        const confirmations = (await tronWeb.trx.getCurrentBlock()).block_header.raw_data.number - event.block + 1
                        fetch(`https://jackocoins.herokuapp.com/api/v1/tron_hook/${event.result.to}`, {
                            method: "post",
                            body: JSON.stringify({
                                txHash: `0x${event.transaction}`,
                                type: "TOKEN",
                                currency: "TRX",
                                network: "mainnet",
                                token_symbol: "USDT",
                                token_name: "Tether USD",
                                contract: usdtContractAddress,
                                token_type: "TRC-20",
                                address: event.result.to,
                                value: (event.result.value).toFixed(6),
                                confirmations
                            }),
                            headers: { 'Content-Type': 'application/json' },
                        }).then(async res => console.log(await res.json()))
                    }
                })
            })
        }
    });
    console.log("connected to contract")
});

app.get("/create_address", async (req, res) => {
    var addressInfo = await tronWeb.createAccount();
    fetch("https://api.shasta.trongrid.io/wallet/createaccount", {
        method: 'post',
        body: JSON.stringify({
            owner_address: process.env.FEES_ADDRESS,
            account_address: addressInfo.address.base58,
            visible: true
        }),
        headers: { 'Content-Type': 'application/json' },
    })
    tronWeb.trx.sendTransaction(addressInfo.address.base58, 2 * 1e6, process.env.PRIVATE_KEY)
    db((client) => {
        const addresses = client.db("jk").collection("addresses");
        addresses.insert(addressInfo, (err, result) => {
            if(err == null) {
                res.send(addressInfo);
            }
            else res.send(null);
        });
    })
});

app.post("/transfer", async (req, res) => {
    const to = req.body.to;
    const from = req.body.from;
    var amount = req.body.amount;
    var contract = await usdtContract;
    var decimals = await contract.decimals().call()
    amount *= Math.pow(10, decimals)
    if(to == null || from == null || amount == null) {
        res.send({error: "Incomplete parameters"});
        return;
    }
    var contract = await usdtContract;
    const balance = tronWeb.toDecimal((await contract.balanceOf(from).call())._hex)
    if(balance < amount) {
        res.send({error: "Insufficient funds"});
        return;
    }
    db((client) => {
        const addresses = client.db("jk").collection("addresses");
        addresses.findOne({"address.base58": from}, async (err, result) => {
            if(err) {
                console.log(err);
                res.send({error: `${from} not found in database`})
            }
            else {
                res.send({msg: "transaction in process"});
                tronWeb.setPrivateKey(result.privateKey);
                contract.transfer(to, amount).send().then(async trx => {
                    tronWeb.setPrivateKey(process.env.FEES_ADDRESS_PRIVATE_KEY);
                    const balanceTRX = await tronWeb.trx.getBalance(from);
                    const reembursement = 2 * 1e6 - balanceTRX;
                    if(reembursement > 0) {
                        tronWeb.trx.sendTransaction(result.address.base58, reembursement, process.env.FEES_ADDRESS_PRIVATE_KEY)
                    }
                }).catch(console.log);
                tronWeb.setPrivateKey(process.env.FEES_ADDRESS_PRIVATE_KEY);
            }
        })
    })
})

app.get("/transactions/:trxId", async (req, res) => {
    const trxId = req.params.trxId;
    const transactionInfo = await tronWeb.trx.getTransactionInfo(trxId)
    const transaction = await tronWeb.trx.getTransaction(trxId)
    var contract = await usdtContract;
    var decimals = await contract.decimals().call()
    const confirmations = (await tronWeb.trx.getCurrentBlock()).block_header.raw_data.number - transactionInfo.blockNumber + 1
    const dataLength = transaction.raw_data.contract[0].parameter.value.data.length
    const address = tronWeb.address.fromHex(`41${transaction.raw_data.contract[0].parameter.value.data.substring(dataLength - 64*2 + (24), dataLength - 64)}`)
    res.send({
        txHash: trxId,
        type: "TOKEN",
        currency: "TRX",
        network: "mainnet",
        token_symbol: "USDT",
        token_name: "Tether USD",
        contract: usdtContractAddress,
        token_type: "TRC-20",
        address,
        value: (tronWeb.toDecimal(`0x${transactionInfo.log[0].data}`) / Math.pow(10, decimals)).toFixed(6),
        confirmations
    })
})

app.listen(8000, () => console.log("listening on port 8000"))