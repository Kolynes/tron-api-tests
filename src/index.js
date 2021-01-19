const TronWeb = require("tronweb");
const express = require("express");
const mongodb = require("mongodb");
const bodyParser = require("body-parser");
const dotenv = require("dotenv")

dotenv.config({path: __dirname + "/../.env"})

const tronWeb = new TronWeb({
    fullHost: "https://api.shasta.trongrid.io",  // mainnet
    eventServer: "https://api.shasta.trongrid.io",
    privateKey: process.env.PRIVATE_KEY
});

const app = express();
const usdtContract = tronWeb.contract().at("TSMmQT5yQkmJmxzRLAF7UY8UQvbGLtungz"); // the usdt address

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
            console.log(err)
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
                        console.log(event, "\n\n")
                    }
                })
            })
        }
    });
    console.log("connected to contract")
});

app.get("/create_address", async (req, res) => {
    var addressInfo = await tronWeb.createAccount();
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
    const amount = req.body.amount;
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
                tronWeb.setPrivateKey(result.privateKey);
                contract.transfer(to, amount).send().then(console.log).catch(console.log);
                tronWeb.setPrivateKey(process.env.PRIVATE_KEY);
                res.send({msg: "transaction in process"});
            }
        })
    })
})

app.listen(8000, () => console.log("listening on port 8000"))