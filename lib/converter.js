"use strict";

const Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    zlib = Promise.promisifyAll(require('zlib')),
    moment = require('moment'),
    pad = require('pad'),
    numeral = require('numeral');

const FIXED_INT = 100,
    CATEGORY_PADDING = 40,
    TRANSACTION_STATUS = {
        'RS': ' ', // restored
        'PN': '!', // pending
        'UR': ' ', // unreconciled
        'CL': ' ', // cleared
        'RC': '*', // reconciled
    };

const NOTE_POSTING_COST = /^\(\((.*?)\s*(-?\d+\.?\d*)\s*(.*?)\)\)\s*(.*)$/;

function formatCurrency(currency, amount) {
    const floatAmount = amount / FIXED_INT;

    numeral.language(currency.name);
    return {amount: floatAmount, formatted: numeral(floatAmount).format(currency.format)};
}

function sortAndMerge(a) {
    let ledger = '';

    a.sort(function (a, b) {
        return a.time - b.time;
    });

    a.forEach(function (i) {
        ledger += i.text;
    });

    return ledger;
}

function convertCurrency(currency) {
    let text = `commodity ${currency.symbol}\n`;
    text += `\tnote ${currency.name} - ${currency.title}\n`;

    numeral.language(currency.name);
    text += `\tformat ${numeral(1000).format(currency.format)}\n`;

    return text;
}

function convertAccount(account) {
    let text = `account ${account.name}\n`;

    if (account.note) {
        text += `\tnote ${account.note}\n`;
    }

    text += `\tassert commodity == "${account.currency.symbol}"\n`;

    if (!account.is_active) {
        text += `\tassert post.date < [${moment().format('YYYY/MM/DD')}]\n`;
    }

    return text;
}

function convertCategory(category) {
    return `account ${category.name}\n`;
}

function convertPayee(payee) {
    return `payee ${payee.title}\n`;
}

function convertExchangeRate(entities, rate) {
    const date = rate.rate_date.format('YYYY/MM/DD HH:mm:ss'),
        base = formatCurrency(rate.from_currency, FIXED_INT).formatted,
        target =formatCurrency(rate.to_currency, rate.rate * FIXED_INT).formatted;

    return {time: +rate.rate_date, text: `P ${date}\t${rate.from_currency.symbol}\t${target}\n`};
}

function convertTransferTransaction(transaction, options, noteValue) {
    let items = [
        {
            category: `${transaction.from_account.name}`,
            cost: formatCurrency(transaction.from_account.currency, transaction.from_amount)
        },
        {
            category: `${transaction.to_account.name}`,
            cost: formatCurrency(transaction.to_account.currency, transaction.to_amount)
        }
    ];


    if(noteValue) {
        if(transaction.from_account.currency != transaction.to_account.currency) {
            throw new Error("A posting cost may only be specified for same-currency transactions: " + transaction._id);
        }

        items[0].postingCost = formatCurrency(noteValue.currency, Math.sign(transaction.from_amount) * -1 * noteValue.amount * FIXED_INT);
        items[1].postingCost = formatCurrency(noteValue.currency, Math.sign(transaction.from_amount) * -1 * noteValue.amount * FIXED_INT);
    }

    else if (transaction.from_account.currency != transaction.to_account.currency) {
        items[1].postingCost = formatCurrency(transaction.from_account.currency, Math.abs(transaction.from_amount));
    }

    if (options.simplify && !noteValue) {
        delete items[items[1].postingCost ? 0 : 1]['cost'];
    }

    return items;
}

function parseTransactionNote(note, entities) {
    let noteValue = note && note.match(NOTE_POSTING_COST),
        symbol = noteValue && (noteValue[1] || noteValue[3]);

    return noteValue && {
        amount: parseFloat(noteValue[2]),
        currency: entities['currency'].find(c => c && c.symbol == symbol),
        note: noteValue[4]
    };
}

function convertSimpleExpenseTransaction(transaction, options) {
    let originalCost = transaction.original_currency && formatCurrency(transaction.original_currency, transaction.original_from_amount),
        nOriginalCost = transaction.original_currency && formatCurrency(transaction.original_currency, -1 * transaction.original_from_amount),
        accountCost = formatCurrency(transaction.from_account.currency, transaction.from_amount),
        nAccountCost = formatCurrency(transaction.from_account.currency, -1 * transaction.from_amount),
        items = [
            {
                category: `${transaction.from_account.name}`
            },
            {
                category: (transaction.category ? transaction.category.name : options.unknownExpense)
            }
        ];

    if (!originalCost) {
        items[0].cost = accountCost;
        items[1].cost = nAccountCost;
    } else if (accountCost.amount < 0) {
        items[0].cost = accountCost;
        items[1].cost = nOriginalCost;
        items[1].postingCost = nAccountCost;
    } else {
        items[0].cost = accountCost;
        items[1].cost = nOriginalCost;
        items[1].postingCost = accountCost;
    }

    if (options.simplify) {
        const simplifyItem = !originalCost ? accountCost.amount <= 0 ? 1 : 0 : 0;
        delete items[simplifyItem]['cost'];
    }

    return items;
}

function convertSplitExpenseTransaction(transaction, entities) {
    const options = entities.options;

    let originalSign = Math.sign(transaction.from_amount),
        items = [{
            category: `${transaction.from_account.name}`,
            cost: formatCurrency(transaction.from_account.currency, transaction.from_amount)
        }];

    items.push(... transaction.splits.map(function (splitTransaction) {
        let noteValue = parseTransactionNote(splitTransaction.note, entities);
        let item = {};

        if (options.projects) {
            item.project = splitTransaction.project && splitTransaction.project.name;
        }

        if (splitTransaction.to_account) {
            item.category = `${splitTransaction.to_account.name}`;
        } else {
            item.category = (splitTransaction.category ? splitTransaction.category.name : options.unknownExpense);
        }

        // Transfer
        if (splitTransaction.to_amount && splitTransaction.to_account) {
            item.cost = formatCurrency(splitTransaction.to_account.currency, splitTransaction.to_amount);
            if (splitTransaction.to_account.currency != splitTransaction.from_account.currency) {
                item.postingCost = formatCurrency(splitTransaction.from_account.currency, Math.abs(splitTransaction.from_amount));
            }
        }

        // Note-specified original_currency
        else if (noteValue) {
            item.cost = formatCurrency(noteValue.currency, Math.sign(splitTransaction.from_amount) * -1 * noteValue.amount * FIXED_INT);
            item.postingCost = formatCurrency(splitTransaction.from_account.currency, Math.abs(splitTransaction.from_amount));
            item.extra = noteValue.note;
        }

        // Nothing special
        else {
            item.cost = formatCurrency(splitTransaction.from_account.currency, -1 * splitTransaction.from_amount);
        }

        if (splitTransaction.note && !noteValue) {
            item.extra = splitTransaction.note;
        }

        if (Math.sign(item.cost.amount) === originalSign) {
            originalSign = false;
        }

        if (options.projects && +splitTransaction.project._id) {
            item.project = splitTransaction.project.title;
        }

        return item;
    }));

    if (options.simplify && originalSign !== false) {
        const simplifyItem = items.length == 2 ? !items[1].postingCost && originalSign <= 0 ? 1 : 0 : 0;
        delete items[simplifyItem]['cost'];
    }

    return items;
}

function convertTransaction(entities, transaction) {
    const options = entities.options;

    if (transaction.is_template || transaction.parent)
        return;

    const noteValue = parseTransactionNote(transaction.note, entities),
          noteText = noteValue ? noteValue.note : transaction.note;

    const date = transaction.datetime.format('YYYY/MM/DD'),
        state = TRANSACTION_STATUS[transaction.status],
        payee = transaction.payee ? transaction.payee.title : options.unknownPayee,
        note = noteText ? `  ; ${noteText}` : '',
        items = [];

    let text = `${date} ${state} ${payee}${note}\n`;

    if (options.debug) {
        text += `\t; FinancistoId: ${transaction._id}\n`;
    }

    if (options.projects && +transaction.project._id) {
        text += `\t; Project: ${transaction.project.title}\n`;
    }

    if (options.locations && transaction.location && +transaction.location._id) {
        text += `\t; Location: ${transaction.location.name}\n`;
    }

    if (options.lonlats && transaction.longitude && transaction.latitude && transaction.provider) {
        text += `\t; LonLat: ${transaction.longitude}, ${transaction.latitude} (${transaction.provider})\n`;
    }

    // Transfer between two accounts
    if (transaction.from_account && transaction.to_account) {
        items.push(... convertTransferTransaction(transaction, options, noteValue));
    }

    // Simple expense
    else if (transaction.splits.length === 0) {
        items.push(... convertSimpleExpenseTransaction(transaction, options));
    }

    // Split transaction
    else {
        items.push(... convertSplitExpenseTransaction(transaction, entities, options));
    }

    items.sort(function (a, b) {
        return (a.cost ? a.cost.amount : 0) - (b.cost ? b.cost.amount : 0);
    });

    items.forEach(function (item) {
        let itemText = `\t${item.cost ? pad(item.category, item.cost.amount < 0 ? CATEGORY_PADDING : CATEGORY_PADDING + 1) + '  ' : item.category}`;
        if (item.cost) {
            itemText += `${item.cost.formatted}`;
        }

        if (item.cost && item.postingCost) {
            itemText += ` (@@) ${item.postingCost.formatted}`;
        }

        let baseLength = itemText.length;
        if (item.extra) {
            itemText += `  ; ${item.extra}`;
        }

        itemText += '\n';

        if (item.project) {
            itemText += `${pad('\t', baseLength)}  ; Project: ${item.project}\n`;
        }

        text += itemText;
    });

    text += '\n';

    return {time: +transaction.datetime, text: text};
}

function convert(entities) {
    const options = entities.options;

    let ledgerExchangeRates = [],
        ledgerDefinitions = [],
        ledgerBudgets = [],
        ledgerTransactions = [],
        result = {
            pricedb: null,
            definitions: null,
            ledger: null
        };

    if (options.pricedb) {
        entities['currency_exchange_rate'].forEach(function (rate) {
            const converted = convertExchangeRate(entities, rate);
            converted && ledgerExchangeRates.push(converted);
        });

        result.pricedb = sortAndMerge(ledgerExchangeRates);
    }

    if (options.currencies) {
        result.definitions = result.definitions || '';

        entities['currency'].sort((a, b) => a.name.localeCompare(b.name));
        entities['currency'].forEach(account => {
            result.definitions += `${convertCurrency(account)}\n`;
        });
    }

    if (options.accounts) {
        result.definitions = result.definitions || '';

        entities['account'].sort((a, b) => a.title.localeCompare(b.title));
        entities['account'].forEach(account => {
            result.definitions += convertAccount(account);
            result.definitions += "\n";
        });

        entities['category'].sort((a, b) => a.name.localeCompare(b.name));
        entities['category'].forEach(category => {
            result.definitions += convertCategory(category);
            result.definitions += "\n";
        });
        result.definitions += "\n";
    }

    if (options.payees) {
        result.definitions = result.definitions || '';

        entities['payee'].sort((a, b) => a.title.localeCompare(b.title));
        entities['payee'].forEach(payee => {
            result.definitions += convertPayee(payee);
        });
        result.definitions += "\n";
    }

    if (options.locations) {
        result.definitions = result.definitions || '';
        result.definitions += "tag Location\n";
    }
    if (options.lonlats) {
        result.definitions = result.definitions || '';
        result.definitions += "tag LonLat\n";
    }
    if (options.projects) {
        result.definitions = result.definitions || '';
        result.definitions += "tag Project\n";
    }

    if (options.budgets) {
        // TODO: budgets
        //ledger += sortAndMerge(ledgerBudgets);
        //ledger += '\n';
    }

    if (options.transactions) {
        entities['transaction'].forEach(function (transaction) {
            const converted = convertTransaction(entities, transaction);
            converted && ledgerTransactions.push(converted);
        });

        result.ledger = '';
        result.ledger += "tag VALUE\n= /^Expenses:/\n\t; VALUE:: market(post.commodity, post.date, exchange)\n\n";
        result.ledger += sortAndMerge(ledgerTransactions);
    }

    return result;
}

module.exports = {
    convert: convert
};
