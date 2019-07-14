'use strict';

const Schmervice = require('schmervice');

const internals = {};

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
            this.interval = setInterval(this.runCrons.bind(this), ONE_MINUTE);
        }
    }

    teardown() {

        clearInterval(this.interval);
    }

    async runCrons() {

        // TODO need to implement a couple things:
        // runOnce, querying against lastMissedAt, other stuff

        console.log('Running crons!');

        const { Cron } = this.server.models();

        const intervalFirstRuns = await Cron.query()
            .where('type', 'interval')
            .whereNull('lastRunAt')
            .whereRaw('enabled = ?', true)
            .whereRaw('?? + ??::interval < now()', ['createdAt', 'cronExpression'])
            // Avoid missed runs
            .whereRaw('?? + ??::interval < now() + interval \'1 minute\'', ['createdAt', 'cronExpression']);

        console.log('intervalFirstRuns', intervalFirstRuns);

        const intervalRepeatRuns = await Cron.query()
            .where('type', 'interval')
            .whereNotNull('lastRunAt')
            .whereRaw('enabled = ?', true)
            .whereRaw('?? + ??::interval < now()', ['lastRunAt', 'cronExpression']);
            // Avoid missed runs
            // .whereRaw('?? + ??::interval < now() + interval \'1 minute\'', ['lastRunAt', 'cronExpression']);

        console.log('intervalrepeatRuns', intervalRepeatRuns);

        // const crons = [...intervalFirstRuns, ...intervalRepeatRuns];
        const crons = [];

        for (const cron of crons) {

            // Don't let 1 cron failing
            // prevent the others from running
            try {
                await Cron.query()
                    .findById(cron.id)
                    .patch({
                        lastRunAt: new Date().toISOString()
                    });
                this.handleCron(cron);
            }
            catch (err) {
                this.server.log(['error'], { msg: `Error saving lastRunAt for cron "${cron.name}"`, err, datetime: new Date().toISOString() });
            }
        }

        // Run this stuff after the crons have run

        const missedIntervalFirstRuns = await Cron.query()
            .where('type', 'interval')
            .whereNull('lastRunAt')
            .whereRaw('enabled = ?', true)
            .whereRaw('?? + ??::interval >= now() + interval \'1 minute\'', ['createdAt', 'cronExpression']);

        console.log('missedIntervalFirstRuns', missedIntervalFirstRuns);

        // const missedIntervalRepeatRuns = await Cron.query()
        //     .where('type', 'interval')
        //     .whereNotNull('lastRunAt')
        //     .whereRaw('enabled = ?', true)
        //     .whereRaw('?? + ??::interval >= now() + interval \'1 minute\'', ['lastRunAt', 'cronExpression']);
        //
        // console.log('missedIntervalRepeatRuns', missedIntervalRepeatRuns);

        // const missedCrons = [...missedIntervalFirstRuns, ...missedIntervalRepeatRuns];
        const missedCrons = [];

        for (const missedCron of missedCrons) {

            await this.logMissedCron(missedCron);
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

    async create({ name, cronExpression, details, enabled }) {

        const { Cron } = this.server.models();

        return await Cron.query()
            .insert({
                name,
                cronExpression,
                details,
                enabled
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

        this.server.log(['cron-service'], {
            cron,
            datetime: new Date().toISOString()
        });

        const { name, details = {} } = cron;

        // TODO replace with hapi server state stuff
        for (const handler of (this.state.handlers[name] || [])) {
            try {
                const response = await handler(details);
                await this.onHandlerResponse(cron, response);
            }
            catch (err) {
                await this.handleError(cron, err);
            }
        }
    }

    async onHandlerResponse(cron, response) {

        const { CronLog } = this.server.models();

        this.server.log(['cron-service'], {
            msg: 'Handler response',
            cronName: cron.name,
            response,
            datetime: new Date().toISOString()
        });

        return await CronLog.query()
            .insert({
                cronId: cron.id,
                cronName: cron.name,
                cronDetails: cron.details,
                handlerResult: response
            });
    }

    async handleError(cron, error) {

        const { CronLog } = this.server.models();

        this.server.log(['cron-service', 'error'], {
            msg: 'Cron handler error',
            cronName: cron.name,
            error,
            datetime: new Date().toISOString()
        });

        return await CronLog.query()
            .insert({
                cronId: cron.id,
                cronName: cron.name,
                cronDetails: cron.details,
                handlerError: error
            });
    }

    async logMissedCron(cron) {

        const { Cron, CronLog } = this.server.models();

        await Cron.query()
            .findById(cron.id)
            .patch({
                lastMissedAt: new Date().toISOString()
            });

        return await CronLog.query()
            .insert({
                isMissed: true,
                cronId: cron.id,
                cronName: cron.name
            });
    }
};
