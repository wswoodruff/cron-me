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
                log: ['error', 'cron-queue'],
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
                        $default: (process.env.LISTEN_SQS_QUEUE === '1'),
                        test: false
                    },
                    aws: {
                        region: process.env.AWS_REGION,
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                        SQSUrl: process.env.AWS_SQS_QUEUE_URL,
                        SQSArn: process.env.AWS_SQS_QUEUE_ARN,
                        SQSId: process.env.AWS_SQS_QUEUE_ID
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
