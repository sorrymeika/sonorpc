const { parseInvoker, parseData } = require('./data/parser');
const { formatInvoker, formatData } = require('./data/formater');
const { startRegistry } = require('./Registry');
const { createProvider } = require('./Provider');
const { registerConsumer } = require('./Consumer');
const Service = require('./Service');

exports.parseInvoker = parseInvoker;
exports.parseData = parseData;
exports.formatInvoker = formatInvoker;
exports.formatData = formatData;

exports.startRegistry = startRegistry;
exports.createProvider = createProvider;
exports.registerConsumer = registerConsumer;

exports.Service = Service;
