'use strict';

const Joi = require('joi');
const { Model } = require('./helpers');

module.exports = class CronLog extends Model {

    // CronLogs should not be updated. This table should be write-only

    static get tableName() {

        return 'CronLogs';
    }

    static get joiSchema() {

        return Joi.object({
            id: Model.schema.numericId,
            cronId: Model.schema.numericId,
            isMissed: Joi.boolean(), // For logging missed cron runs
            // Save some frozen info about the cron
            cronName: Joi.string(),
            cronDetails: Joi.string(),
            handlerResult: Joi.string(),
            handlerError: Joi.string(),
            notes: Joi.string(),
            // Timestamps
            createdAt: Model.schema.timestamp
        });
    }

    $beforeInsert() {

        this.createdAt = new Date().toISOString();
    }
};
