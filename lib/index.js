const parser = require('./parser'),
    converter = require('./converter');

const defaults = {
    unknownPayee: 'Unknown',
    unknownExpense: 'Expenses:Unknown',
    accountPrefix: 'Assets:',
    accounts: true,
    currencies: true,
    payees: true,
    transactions: true,
    pricedb: true,
    simplify: false,
    debug: false,
    projects: true,
    locations: true,
    lonlats: false
};

function extendOptionsWithDefaults(options) {
    options = options || {};

    Object.setPrototypeOf(options, defaults);

    return options;
}

function fromAnyFile(filename, options) {

    options = extendOptionsWithDefaults(options);

    return parser.fromAnyFile(filename, options)
        .then(converter.convert);
}

function fromBackup(gzippedFilename, options) {

    options = extendOptionsWithDefaults(options);

    return parser.fromBackup(gzippedFilename, options)
        .then(converter.convert);
}

function fromFile(plaintextFilename, options) {

    options = extendOptionsWithDefaults(options);

    return parser.fromFile(plaintextFilename, options)
        .then(converter.convert);
}

function fromString(content, options) {

    options = extendOptionsWithDefaults(options);

    return parser.fromString(content, options)
        .then(converter.convert);
}

module.exports = {
    defaults: defaults,
    fromAnyFile: fromAnyFile,
    fromBackup: fromBackup,
    fromFile: fromFile,
    fromString: fromString
};
