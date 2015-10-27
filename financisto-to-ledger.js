#!/usr/bin/env node
"use strict";

const financistoToLedger = require('./lib'),
    argparse = require('argparse'),
    Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    mkdirp = Promise.promisifyAll(require('mkdirp')),
    path = require('path');

function addBooleanGroup(arg, help) {
    let group = parser.addMutuallyExclusiveGroup();
    group.addArgument(`--no-${arg}`, {
        action: 'storeFalse',
        dest: arg,
        help: false
    });
    group.addArgument(`--${arg}`, {
        action: 'storeTrue',
        dest: arg,
        help: help
    });
}

const parser = new argparse.ArgumentParser({
    version: '0.0.1',
    addHelp: true,
    formatterClass: argparse.ArgumentDefaultsHelpFormatter,
    description: 'Financisto backup to ledger file format converter.'
});

parser.setDefaults(financistoToLedger.defaults);

parser.addArgument('--unknown-expense', {
    dest: 'unknownExpense',
    help: 'Account for unspecified expenses, (default: "%(defaultValue)s")'
});
parser.addArgument('--unknown-payee', {
    dest: 'unknownPayee',
    help: 'Default payee where unspecified. (default: "%(defaultValue)s")'
});
parser.addArgument('--account-prefix', {
    dest: 'accountPrefix',
    help: 'Account prefix to use if the account name is not hierarchical. (default: "%(defaultValue)s")'
});

addBooleanGroup('transactions', "Convert transactions.");
addBooleanGroup('accounts', "Add 'account ...' definitions.");
addBooleanGroup('currencies', "Add 'commodity ...' definitions.");
addBooleanGroup('payees', "Add 'payee ...' definitions.");
addBooleanGroup('pricedb', "Add 'P ...' exchange rates.");
addBooleanGroup('projects', "Add Projects to postings as tags.");
addBooleanGroup('locations', "Add Locations to postings as tags.");
addBooleanGroup('lonlats', "Add longitude and latitude to postings as tags.");
addBooleanGroup('simplify', "Simplify the file where possible to ease readability.");
addBooleanGroup('debug', "Add debug information to postings.");

parser.addArgument('filename', {help: 'Financisto backup file'});
parser.addArgument('output-dir', {
    nargs: '?',
    help: 'Directory to save files to. Will create prices.db, definitions.ledger and financisto.ledger in the directory.'
});

const args = parser.parseArgs();

financistoToLedger.fromAnyFile(args.filename, args)
    .then(resultHandler)
    .then(successHandler, errorHandler);

function resultHandler(result) {
    const outputDir = args['output-dir'];

    return outputDir ? writeToDirectory(result, outputDir) : writeToConsole(result);
}

function writeToDirectory(result, outputDir) {
    return mkdirp.mkdirpAsync(outputDir)
        .then(() => {
            const definitionsPath = path.join(outputDir, "definitions.ledger"),
                pricedbPath = path.join(outputDir, "prices.db"),
                ledgerPath = path.join(outputDir, "financisto.ledger"),
                promises = [];

            if (result.definitions) {
                promises.push(fs.writeFileAsync(definitionsPath, result.definitions));
            }

            if (result.pricedb) {
                promises.push(fs.writeFileAsync(pricedbPath, result.pricedb));
            }


            if (result.ledger) {
                let ledgerText = '';
                if (result.definitions) {
                    ledgerText += "include definitions.ledger\n\n";
                }
                if (result.pricedb) {
                    ledgerText += "include prices.db\n\n";
                }
                if (result.ledger) {
                    ledgerText += result.ledger + "\n";
                }
                promises.push(fs.writeFileAsync(ledgerPath, ledgerText));
            }

            return Promise.all(promises);
        });
}

function writeToConsole(result) {
    let ledgerText = '';
    if (result.definitions) {
        ledgerText += `${result.definitions}\n`;
    }
    if (result.pricedb) {
        ledgerText += `${result.pricedb}\n`;
    }
    if (result.ledger) {
        ledgerText += `${result.ledger}\n`;
    }

    console.log(ledgerText);
}

function successHandler() {
    process.exit(0);
}

function errorHandler(err) {
    console.error("Failed to parse file:", err);
    process.exit(1);
}
