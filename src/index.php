<?php
require("vendor/autoload.php");
use IEXBase\TronAPI\Tron;

// testnet configuration
$fullNode = new \IEXBase\TronAPI\Provider\HttpProvider('https://api.nileex.io');
$solidityNode = new \IEXBase\TronAPI\Provider\HttpProvider('https://api.nileex.io');
$eventServer = new \IEXBase\TronAPI\Provider\HttpProvider('https://api.nileex.io');

try {
    $tron = new \IEXBase\TronAPI\Tron($fullNode, $solidityNode, $eventServer);
} catch (\IEXBase\TronAPI\Exception\TronException $e) {
    exit($e->getMessage());
}

$tron->setAddress('TZCDP57jHn66AJ2hZHqrmievYdzhriLNCm');
$balance = $tron->getBalance(null, true);
echo($balance . "\n");

$newAccount = $tron->createAccount();
$tron->registerAccount("TZCDP57jHn66AJ2hZHqrmievYdzhriLNCm", $newAccount->getAddress(true));
echo($newAccount->getAddress(true) . "\n");

$manager = $tron->getManager();
$smart_contract = $manager->request("wallet/getcontract", [
    "value" => "TDSapWWEAxsjZMyoBSeFMheyQ1pnk3YLa2", // usdt smart contract on testnet
    "visible" => true
]);
