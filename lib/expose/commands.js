'use strict';

const Hoek = require('hoek');

module.exports = (server, options) => ({
    value: {
        list: {
            command: async (srv, [search]) => {

                const { cronMeService } = srv.services();

                console.log(await cronMeService.listCrons(search));
            }
        },
        create: {
            command: async (srv, [name, cronExpression, details]) => {

                const { cronMeService } = srv.services();

                Hoek.assert(name && cronExpression, 'Must specify name and cronExpression');

                console.log(await cronMeService.create({
                    name,
                    cronExpression,
                    details
                }));
            }
        }
    }
});
