'use strict';

exports.up = async (knex) => {

    await knex.schema
        .createTable('Crons', (table) => {

            // See CronModel.TYPES
            const CronTypes = ['interval', 'timestamp', 'day-schedule'];

            table.increments('id').primary();
            table.enum('type', CronTypes, {
                useNative: true,
                enumName: 'cron_type'
            });
            table.string('cronExpression');
            table.specificType('time', 'time without time zone');
            table.string('name').unique();
            table.jsonb('details');
            table.boolean('enabled').defaultTo(true);
            table.boolean('runMissed').defaultTo(true);
            table.boolean('runOnce').defaultTo(false);
            table.specificType('lastRunAt', 'timestamp with time zone');
            table.specificType('createdAt', 'timestamp with time zone');
            table.specificType('updatedAt', 'timestamp with time zone');

            table.index('lastRunAt');
            table.index('createdAt');
        })
        .createTable('CronLogs', (table) => {

            table.increments('id').primary();

            table.integer('cronId'); // Intentionally not referencing the Crons table
            table.boolean('isMissed').defaultTo(false);
            table.string('cronName');
            table.string('cronDetails');
            table.string('notes');
            table.timestamp('createdAt');

            table.index('cronName');
        });
};

exports.down = async (knex) => {

    await knex.schema
        .dropTable('CronLogs')
        .dropTable('Crons')
        .raw('drop type cron_type');
};
