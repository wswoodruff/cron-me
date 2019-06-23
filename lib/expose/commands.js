'use strict';

const Hoek = require('hoek');

module.exports = (server, options) => ({
    value: {
        default: {
            command: async (srv, args) => {

                const { cronService } = srv.services();

                const [cmd, ...cmdArgs] = args;

                if (!cmd) {
                    throw new Error('cmd required');
                }

                switch (cmd) {
                    case 'list': {

                        const crons = await cronService.listCrons();
                        console.log('\nlist of crons:', crons);

                        break;
                    }

                    case 'add': {

                        const [eventType] = cmdArgs;

                        Hoek.assert(eventType, 'Must specify event-type');

                        const addedCron = await cronService.addCron({
                            eventType,
                            cronExpression: 'test',
                            details: { rando: Math.random() }
                        });

                        console.log('\naddedCron', addedCron);
                        break;
                    }

                    default:
                        throw new Error(`Unsupported cmd "${cmd}"`);
                }
            },
            description: `commands [list|add]`
        }
    }
});
