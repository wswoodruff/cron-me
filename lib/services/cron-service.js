'use strict';

const Package = require('../../package.json');
const Bounce = require('bounce');
const Hoek = require('hoek');
const Schmervice = require('schmervice');
const { Consumer } = require('sqs-consumer');
const Objection = require('objection');

const VISIBILITY_TIMEOUT = 60;

const internals = {};

internals.num = 1;

module.exports = class CronService extends Schmervice.Service {

    constructor(server, options) {

        super(server, options);
        this.isRunning = false;

        const { SQSUrl, SQSArn, SQSId } = options.aws || {};

        this.SQSUrl = SQSUrl;
        this.SQSArn = SQSArn;
        this.SQSId = SQSId;

        Hoek.assert(SQSUrl, 'Must specify options.aws.SQSUrl');
        Hoek.assert(SQSArn, 'Must specify options.aws.SQSArn');
        Hoek.assert(SQSId, 'Must specify options.aws.SQSId');

        // Placeholder mostly
        this.handleError = (err) => console.error('error', err);
    }

    initialize() {

        if (this.options.runCrons) {
            this.start();
        }
    }

    teardown() {

        this.stop();
    }

    start() {

        if (this.isRunning) {
            return;
        }

        const { awsService } = this.server.services();
        const { SQSUrl } = this.options.aws || {};

        this.consumer = Consumer.create({
            sqs: awsService.sqs,
            queueUrl: this.SQSUrl,
            visibilityTimeout: VISIBILITY_TIMEOUT,
            handleMessage: this.handleMessage.bind(this)
        });

        this.consumer.on('processing_error', this.handleError);
        this.consumer.on('error', this.handleError);
        this.consumer.start();

        this.isRunning = true;

        this.server.log(['cron-queue'], { msg: 'Cron queue started', datetime: new Date() });
    }

    stop() {

        if (!this.isRunning) {
            return;
        }

        this.consumer.stop();
        this.consumer.removeListener('error', this.handleError);
        this.consumer.removeListener('processing_error', this.handleError);
        this.isRunning = false;

        // TODO replace with hapi server state stuff
        // this.state = {
        //     handlers: {}
        // };

        this.server.log(['cron-queue'], { msg: 'Cron queue stopped', datetime: new Date() });
    }

    async handleMessage(message) {

        let body;

        try {
            // TODO do some schema validation on the Body with Joi
            body = JSON.parse(message.Body);
        }
        catch (err) {
            Bounce.ignore(err, SyntaxError);
            throw new Error('Could not JSON parse message body');
        }

        return await this.handleCron(body);
    }

    async registerHandler({ eventType, func }) {

        console.log('Registering handler for ', eventType);

        // TODO replace with hapi server state stuff
        // if (this.state.handlers[eventType]) {
        //     throw new Error(`Already registered handler for event '${eventType}'`);
        // }

        // this.state.handlers[eventType] = func;
    }

    async addCron({ eventType, version, cronExpression, details, enabled }) {

        Hoek.assert(eventType && cronExpression, 'eventType and cronExpression are required');

        // docs for crons
        // https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#CronExpressions
        if (cronExpression === 'test') {
            cronExpression = '0/1 * * * ? *'; // Run every minute
        }

        enabled = typeof enabled === 'undefined' ? true : enabled;

        const { awsService } = this.server.services();

        // Encourage the use of 'tags' so we can namespace our apps n stuff

        // docs
        // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchEvents.html#putRule-property

        const rule = {
            Name: eventType,
            // ScheduleExpression: `cron(${cronExpression})`,
            ScheduleExpression: `rate(1 minute)`,
            State: enabled ? 'ENABLED' : 'DISABLED'
        };

        const newRule = await awsService.cloudwatch.putRule(rule).promise();

        // docs
        // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchEvents.html#putTargets-property

        // Do the putTargets thing here

        // cron types are 'timeout' and 'interval'
        // Make a special flag in the JSON to delete the when received
        // so we can do onetimes!!

        const target = {
            Rule: eventType,
            Targets: [
                {
                    Arn: this.SQSArn,
                    Id: this.SQSId,
                    // 'Input' is the 'Constant (JSON text)' option under 'Configure input' for
                    // Cloudwatch events as seen in aws cloudwatch rules UI
                    Input: JSON.stringify({ version: version || Package.version, eventType, details: details || {} }),
                    SqsParameters: {
                        MessageGroupId: eventType
                    }
                }
            ]
        };

        await awsService.cloudwatch.putTargets(target).promise();
        const addTargetResponse = await awsService.cloudwatch.putTargets(target).promise();

        return { newRule, addTargetResponse };
    }

    async enableCron({ eventType }) {


    }

    async disableCron({ eventType }) {


    }

    async updateCron() {

    }

    async listCrons() {

        const { awsService } = this.server.services();

        const { Rules } = await awsService.cloudwatch.listRules().promise();

        return Rules;
    }

    async handleCron(msgBody) {

        console.log('Now!', new Date());
        console.log('Number', internals.num++);
        console.log('msgBody', msgBody);

        const { eventType, details = {} } = msgBody;

        // TODO replace with hapi server state stuff
        // if (!this.state.handlers[eventType]) {
            // TODO
            // Disable (not delete) cron here if there's no handler!
            // When we add handlers later we'll ensure they
            // are turned on
            // this.handleError(new Error(`No handler for event type: '${type}'`));
        // }
        // else {
        //     try {
        //         await this.state.handlers[eventType](details);
        //     }
        //     catch (err) {
        //         this.handleError(err);
        //     }
        // }
    }
};
