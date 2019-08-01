'use strict';

const Bounce = require('bounce');
const Schmervice = require('schmervice');

const internals = {};

const GRACE_PERIOD_INTERVAL = '\'10 seconds\'';

module.exports = class CronMeService extends Schmervice.Service {

    constructor(server, options) {

        super(server, options);

        // TODO replace with hapi server state stuff
        this.state = {
            handlers: {}
        };
    }

    initialize() {

        const ONE_MINUTE = 60000;

        if (this.options.runCrons) {

            // Start the service interval at the top of the minute

            const secsTilTopOfTheMinute = 60 - new Date().getSeconds();

            setTimeout(() => {

                this.runCrons();
                this.interval = setInterval(this.runCrons.bind(this), ONE_MINUTE);
            }, secsTilTopOfTheMinute * 1000);
        }
    }

    teardown() {

        clearInterval(this.interval);
    }

    async runCrons() {

        this.server.log(['cron-service'], {
            msg: 'Querying crons',
            datetime: new Date().toISOString()
        });

        const { Cron } = this.server.models();

        const timestampRuns = await Cron.query()
            .where('type', 'timestamp')
            .whereNull('lastRunAt')
            .whereRaw('enabled = ?', true)
            .whereRaw(`(??::timestamptz - ??::timestamptz) + ??::timestamptz <= (now() + interval ${GRACE_PERIOD_INTERVAL})`, ['createdAt', 'createdAt', 'cronExpression']);

        const intervalFirstRuns = await Cron.query()
            .where('type', 'interval')
            .whereNull('lastRunAt')
            .whereRaw('enabled = ?', true)
            .whereRaw(`?? + ??::interval <= (now() + interval ${GRACE_PERIOD_INTERVAL})`, ['createdAt', 'cronExpression']);

        const intervalRepeatRuns = await Cron.query()
            .where('type', 'interval')
            .whereNotNull('lastRunAt')
            .whereRaw('enabled = ?', true)
            .whereRaw(`?? + ??::interval <= (now() + interval ${GRACE_PERIOD_INTERVAL})`, ['lastRunAt', 'cronExpression']);

        const crons = [...timestampRuns, ...intervalFirstRuns, ...intervalRepeatRuns];

        for (const cron of crons) {

            // Don't let 1 cron failing
            // prevent the others from running
            try {
                this.handleCron(cron);
            }
            catch (err) {
                this.server.log(['error'], { msg: `Error running cron "${cron.name}"`, err, datetime: new Date().toISOString() });
            }
        }
    }

    registerHandler({ name, func }) {

        // TODO replace with hapi server state stuff
        this.state.handlers[name] = [...(this.state.handlers[name] || []), func];

        this.server.log(['cron-service'], {
            msg: `Handler registered for "${name}"`,
            datetime: new Date().toISOString()
        });
    }

    unregisterHandler({ name, func }) {

        // TODO replace with hapi server state stuff
        this.state.handlers[name] = (this.state.handlers[name] || [])
            .filter((handler) => handler !== func);

        this.server.log(['cron-service'], {
            msg: `Handler unregistered for "${name}"`,
            datetime: new Date().toISOString()
        });
    }

    async create({ name, cronExpression, details, enabled = true }) {

        const { Cron } = this.server.models();

        const type = await this.getCronExpressionType(cronExpression);

        // We only support up to the minute accuracy
        if (type === 'timestamp') {
            const d = new Date(cronExpression);
            d.setSeconds(0);
            cronExpression = d.toISOString();
        }

        return await Cron.query()
            .insert({
                name,
                cronExpression,
                details,
                enabled,
                type
            })
            .returning('*');
    }

    async listCrons(search) {

        const { Cron } = this.server.models();

        return await Cron.query()
            .where((builder) => {

                if (search) {
                    builder.where((keyBuilder) => {

                        builder.where('name', 'ilike', `%${search}%`);
                    });
                }
            });
    }

    async handleCron(cron) {

        const { Cron, CronLog } = this.server.models();

        this.server.log(['cron-service'], {
            msg: 'Running cron',
            name: cron.name,
            datetime: new Date().toISOString()
        });

        const extras = {};

        if (cron.type === 'timestamp' || cron.runOnce) {
            extras.enabled = false;
        }

        // TODO Use txn here
        await Cron.query()
            .findById(cron.id)
            .patch({
                lastRunAt: new Date().toISOString(),
                ...extras
            });

        const { name, details = {} } = cron;

        // TODO replace with hapi server state stuff
        for (const handler of (this.state.handlers[name] || [])) {
            try {
                const response = await handler(details);
                await this.onHandlerResponse(cron, response);
            }
            catch (err) {
                this.handleError(cron, err);
            }
        }

        return await CronLog.query()
            .insert({
                cronId: cron.id,
                cronName: cron.name,
                cronDetails: cron.details || ''
            });
    }

    async onHandlerResponse(cron, response) {

        const { Cron } = this.server.models();

        this.server.log(['cron-service'], {
            msg: 'Handler response',
            cronName: cron.name,
            response,
            datetime: new Date().toISOString()
        });

        if (cron.type === 'timestamp') {
            await Cron.query()
                .patch({ enabled: false });
        }
    }

    handleError(cron, error) {

        this.server.log(['cron-service', 'error'], {
            msg: 'Cron handler error',
            cronName: cron.name,
            error,
            datetime: new Date().toISOString()
        });
    }

    async logMissedCron(cron) {

        const { CronLog } = this.server.models();

        return await CronLog.query()
            .insert({
                isMissed: true,
                cronId: cron.id,
                cronName: cron.name
            });
    }

    async getCronExpressionType(cronExpression) {

        try {
            await this.server.knex().raw('select ?::interval', cronExpression);
            return 'interval';
        }
        catch (err) {

            // Postgres error code for 'invalid_datetime_format'
            Bounce.ignore({ code: '22007' });
        }

        try {
            await this.server.knex().raw('select ?::timestamp', cronExpression);
            return 'timestamp';
        }
        catch (err) {

            // Postgres error code for 'invalid_datetime_format'
            Bounce.ignore({ code: '22007' });
        }

        throw new Error('Invalid cron expression');
    }
};
