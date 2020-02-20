
const Parameter = require('parameter');
const parameter = new Parameter({
    validateRoot: true
});

function validate(rule, data) {
    const errors = parameter.validate(rule, data);
    if (errors) {
        const err = new Error("参数错误");
        err.code = 'invalid_param';
        err.errors = errors;
        throw err;
    }
    const result = {};
    for (const key in rule) {
        result[key] = data[key];
    }
    return result;
}

class App {
    constructor({
        logger
    }) {
        this.logger = logger;
        this.validate = validate;
    }
}

module.exports = App;