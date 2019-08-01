'use strict';

const Dotenv = require('dotenv');
const Confidence = require('confidence');
const Toys = require('toys');

// Pull .env into process.env
Dotenv.config({ path: `${__dirname}/.env` });

// Glue manifest as a confidence store
module.exports = new Confidence.Store({
    server: {
        host: 'localhost',
        port: {
            $env: 'PORT',
            $coerce: 'number',
            $default: 3000
        },
        debug: {
            $filter: { $env: 'NODE_ENV' },
            $default: {
                log: ['error', 'cron-service'],
                request: ['error']
            },
            production: {
                request: ['implementation']
            }
        }
    },
    register: {
        plugins: [
            {
                plugin: '../lib', // Main plugin
                options: {
                    runCrons: {
                        $filter: 'NODE_ENV',
                        $default: (process.env.RUN_CRONS === '1'),
                        test: false
                    }
                }
            },
            {
                plugin: 'schwifty',
                options: {
                    $filter: 'NODE_ENV',
                    $default: {},
                    $base: {
                        migrateOnStart: true,
                        knex: {
                            client: 'pg',
                            useNullAsDefault: true,
                            connection: {
                                port: process.env.DB_PORT || 5432,
                                host: process.env.DB_HOST,
                                user: process.env.DB_USER,
                                password: process.env.DB_PASSWORD,
                                database: process.env.DB_NAME
                            }
                        }
                    },
                    production: {
                        migrateOnStart: false
                    }
                }
            },
            {
                plugin: {
                    $filter: { $env: 'NODE_ENV' },
                    $default: 'hpal-debug',
                    production: Toys.noop
                }
            }
        ]
    }
});
