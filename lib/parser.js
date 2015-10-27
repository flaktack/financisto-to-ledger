"use strict";

const Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    zlib = Promise.promisifyAll(require('zlib')),
    moment = require('moment'),
    numeral = require('numeral');

const type_map = {
    transactions: 'transaction',
    locations: 'location'
};

function asMoment(entities, i) {
    return moment(+i);
}

const handlers = {
    account: {
        creation_date: asMoment
    },
    currency_exchange_rate: {
        rate_date: asMoment,
        updated_on: asMoment
    },
    transaction: {
        datetime: asMoment,
        updated_on: asMoment
    }
};

function parseString(text, options) {
    const entities = {
        options: options
    };

    const dbSplit = text.toString().match(/^([^]*?)\n#START\n([^]*?)#END\n?$/),
        headerText = dbSplit[1],
        dbText = dbSplit[2];

    parseEntity(entities, 'header', headerText);

    let regexp = /\$ENTITY:(\w+)\n([^]*?)\n\$\$\n/g,
        match;

    while (match = regexp.exec(dbText)) {
        parseEntity(entities, type_map[match[1]] || match[1], match[2]);
    }

    return Promise.resolve(entities);
}

function parseEntity(entities, type, text) {

    if (!entities[type]) {
        entities[type] = [];
    }

    let lines = text.split('\n'),
        regexp = /^(\w+):(.*)$/,
        entity = {},
        match;

    while (match = lines.length && lines.shift().match(regexp)) {
        entity[match[1]] = match[2];
    }

    if (entity['_id']) {
        entities[type][+entity['_id']] = entity;
    } else {
        entities[type].push(entity);
    }
}

function normalizeEntities(entities) {

    Object.keys(entities).forEach(function (type) {
        if (type == 'options')
            return;

        entities[type].forEach(function (entity) {
            Object.keys(entity).forEach(function (key) {
                let isId = key.match(/^((?:\w+_)?(\w+))_id$/),
                    value = entity[key];

                if (isId && entities[isId[2]]) {
                    entity[isId[1]] = entities[isId[2]][+value];
                    delete entity[key];
                }

                else if (handlers[type] && handlers[type][key]) {
                    entity[key] = handlers[type][key](entities, entity[key]);
                }

                else if (value.match(/^'(.+)'$/)) {
                    entity[key] = value.replace(/^'(.+)'$/, '$1');
                }

                else if (+value == value) {
                    entity[key] = +value;
                }
            });
        });
    });

    return entities;
}

function mapCategories(entities) {
    const categoriesByIndex = [],
        categoriesByLeft = [].concat(entities['category']);

    entities['category'].forEach(function (category) {
        categoriesByIndex[category.left] = category;
        category.name = category.title;
    });

    categoriesByLeft.sort((a, b) => b.left - a.left);

    categoriesByLeft.forEach(function (category) {
        if (!category._id) {
            category.name = 'Expenses:Unknown';
            return;
        }

        for (let i = 1 + category.left; i <= category.right; ++i) {
            if (categoriesByIndex[i]) {
                categoriesByIndex[i].name = category.name + ':' + categoriesByIndex[i].name;
            }
        }
    });

    return entities;
}

function collectSplitTransactions(entities) {

    entities['transaction'].forEach(function (transaction) {
        transaction.splits = [];
    });

    entities['transaction'].forEach(function (transaction) {
        if (transaction.parent_id) {
            let parent = entities['transaction'][+transaction.parent_id];
            parent.splits.push(transaction);
            transaction.parent = parent;
        }
    });

    return entities;
}

function nameAccounts(entities) {

    entities['account'].forEach(function (account) {
        account.name = account.title.indexOf(':') > 0 ? account.title : `${entities.options.accountPrefix}${account.title}`;
    });

    return entities;
}

function createNumeralLanguagesForCurrencies(entities) {

    entities['currency'].forEach(currency => {
        let format = currency.decimals ? `0,0.${'0'.repeat(currency.decimals)}[${'0'.repeat(10 - currency.decimals)}]` : `0,0[.][${'0'.repeat(10)}]`;

        switch (currency.symbol_format) {
            case 'L':
                format = `$${format}`;
                break;
            case 'LS':
                format = `$ ${format}`;
                break;
            case 'R':
                format = `${format}$`;
                break;
            case 'RS':
            default:
                format = `${format} $`;
        }

        currency.format = format;

        numeral.language(currency.name, {
            delimiters: {
                thousands: ',', //currency.group_separator,
                decimal: '.' //currency.decimal_separator
            },
            currency: {
                symbol: currency.symbol
            }
        });
    });

    return entities;
}

function fromAnyFile(filename, options) {
    if (filename.match(/\.(?:gz|backup)$/)) {
        return fromBackup(filename, options);
    } else {
        return fromFile(filename, options);
    }
}

function fromFile(filename, options) {
    return fs.readFileAsync(filename)
        .then(content => fromString(content, options));
}

function fromBackup(filename, options) {
    return fs.readFileAsync(filename)
        .then(zlib.gunzipAsync)
        .then(content => fromString(content, options));
}

function fromString(content, options) {
    return parseString(content, options)
        .then(normalizeEntities)
        .then(nameAccounts)
        .then(mapCategories)
        .then(collectSplitTransactions)
        .then(createNumeralLanguagesForCurrencies);
}

module.exports = {
    fromAnyFile: fromAnyFile,
    fromFile: fromFile,
    fromBackup: fromBackup,
    fromString: fromString
};
