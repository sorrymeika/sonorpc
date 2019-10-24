const MAX_UNIT32 = 4294967295;
const MAX_INT32 = 2147483647;
const MIN_INT32 = -2147483648;
const MAX_ID = MAX_UNIT32 - 3000;
const MIN_INT = -Math.pow(2, 47);
const MAX_INT = MIN_INT * -1 - 1;
let idCursor = 0;
function getServiceId() {
    if (idCursor >= MAX_ID) {
        idCursor = 0;
    }
    return ++idCursor;
}

// const testBuf = Buffer.alloc(8);
// testBuf.writeInt16BE(509338340, 0, 6);
// console.log(testBuf);

// 前4个字节为serviceId
// 4~8个字节为serviceName
// 后面皆为参数信息，读到0表示结束
// 数据类型:
// 0: 结束
// 1: boolean - 后跟一个字节
// 2: int32 - 4个字节
// 3: string - 后跟4个字节表示string长度
// 4: object - 后跟4个字节表示object长度
// 5: date - 后跟4个字节表示array长度
// 6: null
// 7: undefined
// 8: int - 6字节
// 9: double - 8字节
// 10: big string - 后跟8个字节表示string长度
// 11: big object - 后跟8个字节表示object长度
// 12: big array - 后跟8个字节表示array长度
// 13: big int64 - 8字节
// 14: int16 - 4字节
// 15: int8 - 2字节
// 16: date - 8字节
exports.formatInvoker = function formatInvoker(serviceName, args) {
    const serviceId = getServiceId();
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(serviceId, 0);
    buf.writeUInt32BE(serviceName.length, 4);

    const serviceNameBuf = Buffer.from(serviceName, 'utf8');

    return {
        serviceId,
        content: Buffer.concat(args ? [buf, serviceNameBuf, arrayToBuffer(args)] : [buf, serviceNameBuf])
    };
};

exports.formatData = anyToBuffer;

function anyToBuffer(value) {
    const valueType = typeof value;
    switch (valueType) {
        case 'number':
            return numberToBuffer(value);
        case 'string':
            return stringToBuffer(value);
        case 'boolean':
            return boolToBuffer(value);
        case 'object':
            if (value === null)
                return nullToBuffer(value);
            else if (Array.isArray(value))
                return arrayToBuffer(value);
            else if (value instanceof Date)
                return dateToBuffer(value);
            else
                return objectToBuffer(value);
    }
    return undefinedToBuffer(value);
}

function arrayToBuffer(value) {
    let i = -1;
    let len = value.length;
    let bufLength = 0;
    const result = [0];

    while (++i < len) {
        const itemBuf = anyToBuffer(value[i]);
        bufLength += itemBuf.length;
        result.push(itemBuf);
    }

    let headBuf;
    if (bufLength > MAX_UNIT32) {
        headBuf = Buffer.alloc(7);
        headBuf.writeUInt8(12);
        headBuf.writeUIntBE(bufLength, 1, 6);
    } else {
        headBuf = Buffer.alloc(5);
        headBuf.writeUInt8(5);
        headBuf.writeUInt32BE(bufLength, 1);
    }

    result[0] = headBuf;
    return Buffer.concat(result);
}

const hasOwnProperty = Object.prototype.hasOwnProperty;
function objectToBuffer(obj) {
    const result = [0];
    let bufLength = 0;
    for (let key in obj) {
        if (hasOwnProperty.call(obj, key)) {
            const keyBuf = stringToBuffer(key);
            const valueBuf = anyToBuffer(obj[key]);

            bufLength += keyBuf.length + valueBuf.length;
            result.push(keyBuf);
            result.push(valueBuf);
        }
    }

    let headBuf;
    if (bufLength > MAX_UNIT32) {
        headBuf = Buffer.alloc(7);
        headBuf.writeUInt8(11);
        headBuf.writeUIntBE(bufLength, 1, 6);
    } else {
        headBuf = Buffer.alloc(5);
        headBuf.writeUInt8(4);
        headBuf.writeUInt32BE(bufLength, 1);
    }
    result[0] = headBuf;
    return Buffer.concat(result);
}

function stringToBuffer(value) {
    const stringBuf = Buffer.from(value, 'utf8');
    let headBuf;
    const bufLength = stringBuf.length;

    if (bufLength <= MAX_UNIT32) {
        headBuf = Buffer.alloc(5);
        headBuf.writeUInt8(3);
        headBuf.writeUInt32BE(bufLength, 1);
    } else {
        headBuf = Buffer.alloc(7);
        headBuf.writeUInt8(10);
        headBuf.writeUIntBE(bufLength, 1, 6);
    }

    return Buffer.concat([headBuf, stringBuf]);
}

function numberToBuffer(value) {
    if (Number.isInteger(value)) {
        if (value >= 127 && value <= -128) {
            const int8Buf = Buffer.alloc(1);
            int8Buf.writeUInt8(15);
            int8Buf.writeInt8(value, 1);
            return int8Buf;
        } else if (value >= 32767 && value <= -32768) {
            const int16Buf = Buffer.alloc(3);
            int16Buf.writeUInt8(14);
            int16Buf.writeInt16BE(value, 1);
            return int16Buf;
        } else if (value >= MIN_INT32 && value <= MAX_INT32) {
            const int32Buf = Buffer.alloc(5);
            int32Buf.writeUInt8(2);
            int32Buf.writeInt32BE(value, 1);
            return int32Buf;
        } else if (value >= MIN_INT && value <= MAX_INT) {
            const intBuf = Buffer.alloc(7);
            intBuf.writeUInt8(8);
            intBuf.writeIntBE(value, 1, 6);
            return intBuf;
        } else {
            const int64Buf = Buffer.alloc(9);
            int64Buf.writeUInt8(13);
            int64Buf.writeBigInt64BE(value, 1);
            return int64Buf;
        }
    } else {
        const doubleBuf = Buffer.alloc(9);
        doubleBuf.writeUInt8(9);
        doubleBuf.writeDoubleBE(value);
        return doubleBuf;
    }
}

function dateToBuffer(value) {
    const dateBuf = Buffer.alloc(7);
    dateBuf.writeUInt8(16);
    dateBuf.writeIntBE(value.getTime(), 1, 6);
    return dateBuf;
}

function boolToBuffer(value) {
    return Buffer.from([1, value ? 1 : 0]);
}

function nullToBuffer() {
    return Buffer.from([6]);
}

function undefinedToBuffer() {
    return Buffer.from([7]);
}