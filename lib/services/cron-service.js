'use strict';

const Bounce = require('bounce');
const Schmervice = require('schmervice');
const Objection = require('objection');

const internals = {};

const GRACE_PERIOD_INTERVAL = '10 seconds';
const UPCOMING_INTERVAL = '30 minutes';

module.exports = class CronMeService extends Schmervice.Service {

    constructor(server, options) {

        super(server, options);

        // TODO replace with hapi server state stuff
        this.state = {
            handlers: {},
            upcomingHandlers: []
        };

        if (options.debug) {
            this.server.log(['cron-service', 'debug'], {
                msg: 'Running in debug mode'
            });
        }
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

        const buildTimeQuery = (builder, { type, gracePeriod, cronExpression }) => {

            switch (type) {

                case 'timestamp':

                    return builder.whereRaw(`(now() + ?::interval) >= ??::timestamptz`, [gracePeriod, 'cronExpression']);
                case 'intervalFirst':

                    // cronExpression
                    return builder.whereRaw('(now() + ?::interval) >= (?? + ??::interval)', [gracePeriod, 'createdAt', 'cronExpression']);
                case 'intervalRepeat':

                    // cronExpression
                    return builder.whereRaw('(now() + ?::interval) >= (?? + ??::interval)', [gracePeriod, 'lastRunAt', 'cronExpression']);
                case 'daySchedule':
                    return builder
                        .whereRaw('(to_char(now(), ?)::time + ?::interval) > ??', ['HH24:MI:SS', gracePeriod, 'time'])
                        .whereRaw('(to_char(now(), ?)::time + ?::interval) < (?? + ?::interval + ?::interval)', ['HH24:MI:SS', gracePeriod, 'time', '1 minute', gracePeriod]);
                default:
                    this.server.log(['error'], {
                        msg: `No buildTimeQuery for type "${type}"`
                    });
                    return builder;
                    break;
            }
        };

        const timestampRuns = await Cron.query()
            .where('type', 'timestamp')
            .modify('active')
            .modify('firstRun')
            .modify((b) => {

                return buildTimeQuery(b, {
                    type: 'timestamp',
                    gracePeriod: GRACE_PERIOD_INTERVAL
                });
            });

        const intervalFirstRuns = await Cron.query()
            .modify('active')
            .modify('basicInterval')
            .modify('firstRun')
            .modify((b) => {

                return buildTimeQuery(b, {
                    type: 'intervalFirst',
                    gracePeriod: GRACE_PERIOD_INTERVAL
                });
            });

        const intervalRepeatRuns = await Cron.query()
            .modify('active')
            .modify('basicInterval')
            .modify('repeatRun')
            .modify((b) => {

                return buildTimeQuery(b, {
                    type: 'intervalRepeat',
                    gracePeriod: GRACE_PERIOD_INTERVAL
                });
            });

        // Repeating intervals given custom day-schedule
        // cronExpression and time of day
        const dailyRuns = await Cron.query()
            .modify('active')
            .where('type', 'day-schedule')
            .modify((b) => {

                return buildTimeQuery(b, {
                    type: 'daySchedule',
                    gracePeriod: GRACE_PERIOD_INTERVAL
                });
            });

        console.log('dailyRuns', dailyRuns);

        this.handleDebug({
            timestampRuns: timestampRuns.map(({ name }) => name),
            intervalFirstRuns: intervalFirstRuns.map(({ name }) => name),
            intervalRepeatRuns: intervalRepeatRuns.map(({ name }) => name),
            dailyRuns: dailyRuns.map(({ name }) => name)
        });

        const crons = [
            ...timestampRuns,
            ...intervalFirstRuns,
            ...intervalRepeatRuns,
            ...dailyRuns
        ];

        for (const cron of crons) {

            // Don't let 1 cron failing
            // prevent the others from running
            try {
                this.handleCron(cron);
            }
            catch (err) {
                this.handleError(cron, err);
            }
        }

        // Run upcomingHandlers
        if (this.state.upcomingHandlers) {
            const upcomingTimestampRuns = await Cron.query()
                .where('type', 'timestamp')
                .modify('active')
                .modify('firstRun')
                .modify((b) => {

                    return buildTimeQuery(b, {
                        type: 'timestamp',
                        gracePeriod: UPCOMING_INTERVAL
                    });
                });

            const upcomingIntervalFirstRuns = await Cron.query()
                .modify('active')
                .modify('basicInterval')
                .modify('firstRun')
                .modify((b) => {

                    return buildTimeQuery(b, {
                        type: 'intervalFirst',
                        gracePeriod: UPCOMING_INTERVAL
                    });
                });

            const upcomingIntervalRepeatRuns = await Cron.query()
                .modify('active')
                .modify('basicInterval')
                .modify('repeatRun')
                .modify((b) => {

                    return buildTimeQuery(b, {
                        type: 'intervalRepeat',
                        gracePeriod: UPCOMING_INTERVAL
                    });
                });

            // Repeating intervals given custom day-schedule
            // cronExpression and time of day
            const upcomingDailyRuns = await Cron.query()
                .modify('active')
                .where('type', 'day-schedule')
                .modify((b) => {

                    return buildTimeQuery(b, {
                        type: 'daySchedule',
                        gracePeriod: UPCOMING_INTERVAL
                    });
                });

            this.state.upcomingHandlers.forEach((handler) => {

                handler({
                    upcomingTimestampRuns,
                    upcomingIntervalFirstRuns,
                    upcomingIntervalRepeatRuns,
                    upcomingDailyRuns
                });
            });
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

    // This is more of a debugging tool so I won't
    // force users to pass a name for the func but
    // they also won't be able to unregister these
    // Maybe we should autounregister these after some time
    registerUpcomingHandler(func) {

        // TODO replace with hapi server state stuff
        this.state.upcomingHandlers.push(func);

        this.server.log(['cron-service'], {
            msg: 'Upcoming handler registered'
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
                lastRunAt: Cron.getTimestamp(),
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
            msg: 'Cron error',
            cronName: cron.name,
            error: error.message,
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

    handleDebug(args) {

        if (this.options.debug) {
            this.server.log(['cron-service', 'debug'], JSON.stringify(args, null, 4));
        }
    }
};
