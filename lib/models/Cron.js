'use strict';

const Joi = require('joi');
const { Model, ...Helpers } = require('./helpers');

module.exports = class Cron extends Model {

    static get tableName() {

        return 'Crons';
    }

    static get joiSchema() {

        return Joi.object({
            id: Model.schema.numericId,
            type: Joi.string().valid(Cron.TYPES).required(),
            // Must be compatible with postgres interval or timestamp
            cronExpression: Joi.string().required(),
            name: Joi.string(),
            details: Joi.object(),
            enabled: Joi.boolean(), // Defaults to true
            // Need to migrate this to a new name
            // This name is ambiguous as to what it does
            // Did a run miss? Or should I run missed ones?
            runMissed: Joi.boolean(), // Defaults to true
            runOnce: Joi.boolean(), // Defaults to false
            // Timestamps
            lastRunAt: Model.schema.timestamp,
            createdAt: Model.schema.timestamp,
            updatedAt: Model.schema.timestamp
        });
    }

    $beforeInsert() {

        this.createdAt = this.updatedAt = new Date().toISOString();
    }

    $beforeUpdate() {

        this.updatedAt = new Date().toISOString();
    }
};

module.exports.TYPES = Helpers.makeConstants({
    INTERVAL: 'interval',
    DATETIME: 'timestamp',
    // e.g. weekdays at 9am, or tuesdays at 10am
    DAY_SCHEDULE: 'day-schedule'
});
