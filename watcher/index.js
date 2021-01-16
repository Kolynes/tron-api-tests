import TronWeb from "tronweb";
import dotenv from "dotenv";
import express from "express"
import fetch from "node-fetch"
import mongodb from "mongodb";
import bodyParser from "body-parser";

dotenv.config();

const tronWeb = new TronWeb({
    fullHost: "https://api.trongrid.io",
    privateKey: process.env.PRIVATE_KEY
});

const app = express();
const usdtContract = tronWeb.contract().at("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"); // the usdt address

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
    transferEvent.watch((err, result) => console.log(result));
});

app.get("/create_address", async (req, res) => {
    var addressInfo = await tronWeb.createAccount();
    var response = await fetch("https://api.trongrid.io/wallet/createaccount", {
        method: "POST",
        body: JSON.stringify({
            owner_address: process.env.OWNER_ADDRESS,
            account_address: addressInfo.address.base58,
            visible: true
        })
    });
    if(response.ok) {
        db((client) => {
            const addresses = client.db("jk").collection("addresses");
            addresses.insert(addressInfo, (err, result) => {
                if(err == null) {
                    console.log(result);
                    res.send(addressInfo);
                }
                else res.send(null);
            });
        })
    }
    else res.send(null)
});

app.post("/transfer", async (req, res) => {
    const to = req.body.to;
    const from = req.body.from;
    const amount = req.body.amount;
    if(to == null || from == null || amount == null) {
        res.send({error: "incomplete parameters"});
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
        addresses.findOne(("address.base58", async (err, result) => {
            if(err) {
                console.log(err);
                res.send({error: `${from} not found in database`})
            }
            else {
                tronWeb.setPrivateKey(result.privateKey);
                const response = contract.transfer(to, amount).send();
                tronWeb.setPrivateKey(process.env.PRIVATE_KEY);
                res.send({msg: "transaction in process"});
            }
        }))
    })
})

app.listen(8000, () => console.log("listening on port 8000"))