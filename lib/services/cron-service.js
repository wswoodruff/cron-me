'use strict';

const Schmervice = require('schmervice');

const internals = {};

module.exports = class CronService extends Schmervice.Service {

    constructor(server, options) {

        super(server, options);

        // TODO replace with hapi server state stuff
        this.state = {
            handlers: {}
        };
    }

    registerHandler({ eventType, func }) {

        // TODO replace with hapi server state stuff
        this.state.handlers[eventType] = [...(this.state.handlers[eventType] || []), func];

        this.server.log(['cron-service'], {
            msg: `Handler registered for "${eventType}"`,
            datetime: new Date()
        });
    }

    unregisterHandler({ eventType, func }) {

        // TODO replace with hapi server state stuff
        this.state.handlers[eventType] = (this.state.handlers[eventType] || [])
            .filter((handler) => handler !== func);

        this.server.log(['cron-service'], {
            msg: `Handler unregistered for "${eventType}"`,
            datetime: new Date()
        });
    }

    async addCron({ eventType, cronExpression, details, enabled }) {


    }

    async listCrons() {


    }

    async handleCron(cron) {

        this.server.log(['cron-service'], {
            received: cron,
            datetime: new Date()
        });

        const { eventType, details = {} } = cron;

        // TODO replace with hapi server state stuff
        for (const handler of (this.state.handlers[eventType] || [])) {
            try {
                const response = await handler(details);
                this.onHandlerResponse(eventType, response);
            }
            catch (err) {
                this.handleError(err);
            }
        }
    }

    onHandlerResponse(eventType, response) {

        this.server.log(['cron-service'], {
            msg: 'Handler response',
            eventType,
            response,
            datetime: new Date()
        });
    }

    handleError(error) {

        this.server.log(['cron-service', 'error'], {
            msg: 'Cron service error',
            error,
            datetime: new Date()
        });
    }
};
