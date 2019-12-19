function onReceiveBlock(socket, handleBuffer) {
    let type;
    let allBuf;
    let total;
    let reading = false;
    let readingSize = false;

    const HEAD_LENGTH = 7;

    function readBuffer(chunk) {
        if (!reading) {
            type = chunk.readUInt8(0);
            if (type == 0) {
                handleBuffer(type, chunk);
                return;
            } else {
                reading = true;
                allBuf = chunk;
                readingSize = false;

                if (allBuf.length < HEAD_LENGTH) {
                    readingSize = true;
                    return;
                } else {
                    total = allBuf.readUIntBE(1, 6) + HEAD_LENGTH;
                }
            }
        } else {
            allBuf = Buffer.concat([allBuf, chunk]);
        }

        if (readingSize && allBuf.length > HEAD_LENGTH) {
            readingSize = false;
            total = allBuf.readUIntBE(1, 6) + HEAD_LENGTH;
        }

        if (allBuf.length >= total) {
            const buf = allBuf;
            reading = false;
            allBuf = null;

            if (buf.length > total) {
                handleBuffer(type, buf.slice(HEAD_LENGTH, total));
                readBuffer(buf.slice(total));
            } else {
                handleBuffer(type, buf.slice(HEAD_LENGTH));
            }
        }
    }

    socket.on('data', readBuffer);
}
exports.onReceiveBlock = onReceiveBlock;


function sendBlock(socket, buf, cb) {
    const head = Buffer.alloc(7);
    head.writeUInt8(1);
    head.writeUIntBE(buf ? buf.length : 0, 1, 6);

    if (!buf) {
        return socket.write(head, cb);
    } else {
        socket.cork();
        const res = socket.write(head) && socket.write(buf, cb);
        socket.uncork();
        return res;
    }
}
exports.sendBlock = sendBlock;


function sendSuccessBlock(socket, cb) {
    return sendBlock(socket, null, cb);
}
exports.sendSuccessBlock = sendSuccessBlock;


function sendHeartbeat(socket) {
    socket.write(Buffer.from([0]));
}
exports.sendHeartbeat = sendHeartbeat;