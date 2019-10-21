'use strict';

const Joi = require('joi');
const Objection = require('objection');
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
            time: Joi.string(),
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

    static getTimestamp() {

        // All dates in the db should be in UTC, for sanity's sake
        // In addition to that, we ensure there is a timezone on these dates
        // that will show UTC's +00 offset so clients know what the deal is too
        // Casting to timestamp(0) will remove the milliseconds from now()

        return Objection.raw('timezone(\'utc\', now()::timestamp(0))');
    }

    static get modifiers() {

        return {
            active: (builder) => {

                const crons = builder.tableRefFor(this);

                return builder.where(`${crons}.enabled`, true);
            },
            basicInterval: (builder) => {

                const crons = builder.tableRefFor(this);

                return builder
                    .where(`${crons}.type`, 'interval')
                    .whereNull('time');
            },
            firstRun: (builder) => {

                const crons = builder.tableRefFor(this);

                return builder.whereNull(`${crons}.lastRunAt`);
            },
            repeatRun: (builder) => {

                const crons = builder.tableRefFor(this);

                return builder.whereNotNull(`${crons}.lastRunAt`);
            }
        };
    }

    $beforeInsert() {

        this.createdAt = this.updatedAt = Cron.getTimestamp();
    }

    $beforeUpdate() {

        this.updatedAt = Cron.getTimestamp();
    }
};

module.exports.TYPES = Helpers.makeConstants({
    INTERVAL: 'interval',
    DATETIME: 'timestamp',
    // e.g. weekdays at 9am, or tuesdays at 10am
    // This will use the timestamp's time properties to specify
    // the time of day, in addition to a custom func to parse
    // out these time slices, like 'weekdays', etc
    DAY_SCHEDULE: 'day-schedule'
});
