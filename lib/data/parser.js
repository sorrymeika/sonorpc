exports.parseInvoker = function parseInvoker(buf) {
    const serviceId = buf.readUInt32BE();
    const serviceNameLength = buf.readUInt32BE(4);

    let cursor = 8;
    const serviceName = buf.toString('utf8', cursor, cursor + serviceNameLength);
    cursor += serviceNameLength;

    // console.log('parseInvoker buffer:', cursor, buf.length);

    const result = cursor == buf.length ? undefined : readAny(buf, cursor);
    // console.log(serviceId, serviceName, result);

    return {
        serviceId,
        serviceName,
        args: result && result.value
    };
};

exports.parseResult = function (buf) {
    return [buf.readUInt32BE(), readAny(buf, 4)];
};

exports.parseData = function (buf) {
    return readAny(buf, 0);
};

function readAny(buf, cursor) {
    const type = buf.readUInt8(cursor);
    switch (type) {
        case 1:
            return readBool(buf, cursor);
        case 2:
            return readInt32(buf, cursor);
        case 8:
            return readInt(buf, cursor);
        case 13:
            return readInt64(buf, cursor);
        case 14:
            return readInt16(buf, cursor);
        case 15:
            return readInt8(buf, cursor);
        case 3:
            return readString(buf, cursor);
        case 4:
            return readObject(buf, cursor);
        case 11:
            return readBigObject(buf, cursor);
        case 5:
            return readArray(buf, cursor);
        case 6:
            return readNull(buf, cursor);
        case 7:
            return readUndefined(buf, cursor);
        case 12:
            return readBigArray(buf, cursor);
        case 10:
            return readBigString(buf, cursor);
    }
}

function readArray(buf, cursor) {
    const arrayLength = buf.readUInt32BE(cursor + 1);
    cursor += 5;
    return readArrayFrom(buf, cursor, arrayLength);
}

function readBigArray(buf, cursor) {
    const arrayLength = buf.readUIntBE(cursor + 1, 6);
    cursor += 7;
    return readArrayFrom(buf, cursor, arrayLength);
}

function readArrayFrom(buf, cursor, arrayLength) {
    const maxCursor = cursor + arrayLength;
    const array = [];
    while (cursor < maxCursor) {
        const item = readAny(buf, cursor);
        cursor = item.cursor;
        array.push(item.value);
    }

    return {
        value: array,
        cursor
    };
}

function readObject(buf, cursor) {
    const arrayLength = buf.readUInt32BE(cursor + 1);
    cursor += 5;
    return readObjectFrom(buf, cursor, arrayLength);
}

function readBigObject(buf, cursor) {
    const arrayLength = buf.readUIntBE(cursor + 1, 6);
    cursor += 7;
    return readObjectFrom(buf, cursor, arrayLength);
}

function readObjectFrom(buf, cursor, arrayLength) {
    const maxCursor = cursor + arrayLength;
    const obj = {};
    while (cursor < maxCursor) {
        const key = readAny(buf, cursor);
        const value = readAny(buf, key.cursor);
        obj[key.value] = value.value;
        cursor = value.cursor;
    }

    return {
        value: obj,
        cursor
    };
}

function readBool(buf, cursor) {
    return {
        cursor: cursor + 2,
        value: !!buf.readUInt8(cursor + 1)
    };
}

function readString(buf, cursor) {
    const stringLength = buf.readUInt32BE(cursor + 1);
    const start = cursor + 5;
    const end = start + stringLength;
    return {
        cursor: end,
        value: buf.toString('utf8', start, end)
    };
}

function readBigString(buf, cursor) {
    const stringLength = buf.readUIntBE(cursor + 1);
    const start = cursor + 7;
    const end = start + stringLength;
    return {
        cursor: end,
        value: buf.toString('utf8', start, end)
    };
}

function readInt8(buf, cursor) {
    return {
        cursor: cursor + 2,
        value: buf.readInt8(cursor + 1)
    };
}

function readInt16(buf, cursor) {
    return {
        cursor: cursor + 3,
        value: buf.readInt16BE(cursor + 1)
    };
}

function readInt32(buf, cursor) {
    return {
        cursor: cursor + 5,
        value: buf.readInt32BE(cursor + 1)
    };
}

function readInt(buf, cursor) {
    return {
        cursor: cursor + 7,
        value: buf.readIntBE(cursor + 1, 6)
    };
}

function readInt64(buf, cursor) {
    return {
        cursor: cursor + 9,
        value: buf.readBigInt64BE(cursor + 1)
    };
}

function readNull(buf, cursor) {
    return {
        cursor: cursor + 1,
        value: null
    };
}

function readUndefined(buf, cursor) {
    return {
        cursor: cursor + 1,
        value: undefined
    };
}