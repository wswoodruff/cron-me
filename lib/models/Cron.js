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
            // Must be compatible with postgres interval or datetime
            cronExpression: Joi.string().required(),
            name: Joi.string(),
            details: Joi.object(),
            enabled: Joi.boolean(), // Defaults to true
            runMissed: Joi.boolean(), // Defaults to true
            // Timestamps
            lastRunAt: Model.schema.timestamp,
            lastMissedAt: Model.schema.timestamp,
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
    DATETIME: 'datetime'
});
