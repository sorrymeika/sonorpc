
function createPropFilter(target) {
    return typeof target === 'function'
        ? (key) => !/^(prototype|name|constructor)$/.test(key)
        : (key) => key !== 'constructor';
}

function copyProperties(target = {}, source = {}) {
    const ownPropertyNames = Object.getOwnPropertyNames(source);

    ownPropertyNames
        .filter(createPropFilter(target))
        .forEach(key => {
            const desc = Object.getOwnPropertyDescriptor(source, key);
            Object.defineProperty(target, key, desc);
        });

    return target;
}

exports.copyProperties = copyProperties;

function callbackOnce(callback) {
    return (err, data) => {
        if (callback) {
            callback(err, data);
            callback = null;
        }
    };
}

exports.callbackOnce = callbackOnce;
