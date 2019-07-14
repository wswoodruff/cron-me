'use strict';

// Helper Model grabbed from
// https://github.com/devinivy/hapipal-realworld-example-app/blob/master/lib/models/helpers/index.js

const Joi = require('joi');
const Hoek = require('hoek');
const Schwifty = require('schwifty');
const { DbErrors } = require('objection-db-errors');

exports.Model = class extends DbErrors(Schwifty.Model) {

    static createNotFoundError(ctx) {

        const error = super.createNotFoundError(ctx);

        return Object.assign(error, {
            modelName: this.name
        });
    }

    static field(name) {

        return Joi.reach(this.getJoiSchema(), name)
            .optional()
            .options({ noDefaults: true });
    }
};

exports.Model.schema = {
    numericId: Joi.number().integer().min(1),
    timestamp: Joi.date().iso()
};

exports.makeConstants = (obj) => {

    const list = Object.values(obj);
    Object.entries(obj).forEach(([key, value]) => {

        list[key] = value;
    });

    return new Proxy(Object.freeze(list), {
        get: (target, property) => {

            const isSymbol = typeof property === 'symbol';
            Hoek.assert((property in target) || isSymbol, !isSymbol && `Constant ${property} does not exist.`);

            return target[property];
        }
    });
};
