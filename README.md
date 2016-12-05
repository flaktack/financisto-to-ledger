# financisto-to-ledger

A utility to assist in converting [financisto](https://github.com/dsolonenko/financisto) backups into [ledger](https://github.com/ledger/ledger) data files.

## Install

```sh
$ npm install -g financisto-to-ledger
```

## Usage

To convert a file using the default settings:
```sh
$ financisto-to-ledger source.backup > output.ledger
```

The `prices.db`, `definitions.ledger` and `financisto.ledger` may be saved in a directory:
```sh
$ financisto-to-ledger source.backup output
```

## Options

```sh
$ financisto-to-ledger --help
usage: financisto-to-ledger [-h] [-v] [--unknown-expense UNKNOWNEXPENSE]
                            [--unknown-payee UNKNOWNPAYEE]
                            [--account-prefix ACCOUNTPREFIX]
                            [--no-transactions | --transactions]
                            [--no-accounts | --accounts]
                            [--no-currencies | --currencies]
                            [--no-payees | --payees]
                            [--no-pricedb | --pricedb]
                            [--no-projects | --projects]
                            [--no-locations | --locations]
                            [--no-lonlats | --lonlats]
                            [--no-simplify | --simplify]
                            [--no-debug | --debug]
                            filename [output-dir]

Financisto backup to ledger file format converter.

Positional arguments:
  filename              Financisto backup file
  output-dir            Directory to save files to. Will create prices.db, 
                        definitions.ledger and financisto.ledger in the 
                        directory. (default: null)

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  --unknown-expense UNKNOWNEXPENSE
                        Account for unspecified expenses, (default: 
                        "Expenses:Unknown")
  --unknown-payee UNKNOWNPAYEE
                        Default payee where unspecified. (default: "Unknown")
  --account-prefix ACCOUNTPREFIX
                        Account prefix to use if the account name is not 
                        hierarchical. (default: "Assets:")
  --no-transactions
  --transactions        Convert transactions. (default: true)
  --no-accounts
  --accounts            Add 'account ...' definitions. (default: true)
  --no-currencies
  --currencies          Add 'commodity ...' definitions. (default: true)
  --no-payees
  --payees              Add 'payee ...' definitions. (default: true)
  --no-pricedb
  --pricedb             Add 'P ...' exchange rates. (default: true)
  --no-projects
  --projects            Add Projects to postings as tags. (default: true)
  --no-locations
  --locations           Add Locations to postings as tags. (default: true)
  --no-lonlats
  --lonlats             Add longitude and latitude to postings as tags. 
                        (default: false)
  --no-simplify
  --simplify            Simplify the file where possible to ease readability. 
                        (default: false)
  --no-debug
  --debug               Add debug information to postings. (default: false)
```

