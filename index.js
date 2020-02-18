const { parseInvoker, parseData } = require('./lib/data/parser');
const { formatInvoker, formatData } = require('./lib/data/formater');
const { startRegistry } = require('./lib/Registry');
const { createProvider } = require('./lib/Provider');
const { registerConsumer } = require('./lib/Consumer');
const Service = require('./lib/Service');

exports.parseInvoker = parseInvoker;
exports.parseData = parseData;
exports.formatInvoker = formatInvoker;
exports.formatData = formatData;

exports.startRegistry = startRegistry;
exports.createProvider = createProvider;
exports.registerConsumer = registerConsumer;

exports.Service = Service;
