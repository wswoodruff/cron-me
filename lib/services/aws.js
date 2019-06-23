'use strict';

const Hoek = require('hoek');
const AWS = require('aws-sdk');
const Schmervice = require('schmervice');

module.exports = class AwsService extends Schmervice.Service {

    constructor(server, options) {

        super(server, options);

        const {
            region,
            accessKeyId,
            secretAccessKey
        } = options.aws || {};

        Hoek.assert(region, 'Must specify "region"');
        Hoek.assert(accessKeyId, 'Must specify "accessKeyId"');
        Hoek.assert(secretAccessKey, 'Must specify "secretAccessKey"');

        this.sqs = new AWS.SQS({
            apiVersion: '2012-11-05',
            region,
            accessKeyId,
            secretAccessKey
        });

        this.cloudwatch = new AWS.CloudWatchEvents({
            apiVersion: '2015-10-07',
            region,
            accessKeyId,
            secretAccessKey
        });
    }
};
