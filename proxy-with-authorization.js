/**
 * Created by farafonov-dv on 17.10.2016.
 */
var assert = require('assert');
var http = require('http')
var net = require('net')
var url = require('url')
var log4js = require('log4js');
var fs = require('fs');

log4js.configure('./conf/logs.json', { reloadSecs: 30 });

var loggerInfo = log4js.getLogger('info'),
    loggerError = log4js.getLogger('error'),
    loggerDebug = log4js.getLogger('debug');

try {
    var config = require('./conf/properties.json');

    fs.readFile('./conf/properties.json', 'utf8',
        function (err, content) {
            if (err) {
                loggerError.error(err.toString());
                process.exit(-1);
            }
            loggerInfo.trace(content.toString());
        }
    )
}
catch (e) {
    loggerDebug.error(e.toString());
    process.exit(-1);
}

var gateway = config.gateway.URI;

if (process.env.gateway)
    gateway = process.env.gateway

var server = http.createServer(function(request, response) {
//    console.log(request.url);
    loggerInfo.info(request.url);

    var ph = url.parse(request.url)
    var gw = url.parse(gateway)
    var options = {
        port: parseInt(gw.port),
        hostname: gw.hostname,
        method: request.method,
        path: request.url,
        headers: request.headers || {}
    }

    if (gw.auth)
        options.headers['Proxy-Authorization'] = 'Basic ' + new Buffer(gw.auth).toString('base64')

    // console.log(options);
    loggerInfo.trace(options);

    var gatewayRequest = http.request(options)

    gatewayRequest.on('error', function(err) {
        // console.log(err);
        loggerError.warn(err.toString());
        response.end()
    })

    gatewayRequest.on('response', function(gatewayResponse) {
        try {
            assert.notEqual(gatewayResponse.statusCode, 407, 'Proxy AUTH required')
        }
        catch (e) {
            loggerDebug.info(gatewayResponse.statusCode+" "+gatewayResponse.statusMessage);
            // loggerDebug.warn(e.stack.toString());
        }

        gatewayResponse.on('data', function(chunk) {
            try {
                response.write(chunk, 'binary')
            }
            catch (e) {
                loggerDebug.warn(e.stack.toString());
            }
        })

        gatewayResponse.on('end', function() {
            response.end()
        })

        response.writeHead(gatewayResponse.statusCode, gatewayResponse.headers)
    })

    request.on('data', function(chunk) {
        try {
            gatewayRequest.write(chunk, 'binary')
        }
        catch (e) {
            loggerDebug.warn(e.stack.toString());
        }
    })

    request.on('end', function() {
        gatewayRequest.end()
    })

    gatewayRequest.end()

}).on('connect', function(request, socketRequest, head) {

    // console.log(request.url);
    loggerInfo.info(request.url);

    var ph = url.parse('http://' + request.url)
    var gw = url.parse(gateway)
    var options = {
        port: gw.port,
        hostname: gw.hostname,
        method: 'CONNECT',
        path: ph.hostname + ':' + (ph.port || 80),
        headers: request.headers || {}
    }

    if (gw.auth)
        options.headers['Proxy-Authorization'] = 'Basic ' + new Buffer(gw.auth).toString('base64')

    // console.log(options)
    loggerInfo.trace(options);

    var gatewayRequest = http.request(options)

    gatewayRequest.on('error', function(err) {
        // console.log('[error] ' + err);
        loggerError.error(err.toString());
        // process.exit()
    })

    gatewayRequest.on('connect', function(res, socket, head) {
        try {
            assert.equal(res.statusCode, 200)
            assert.equal(head.length, 0)
        }
        catch (e) {
            loggerDebug.info(res.statusCode+" "+res.statusMessage);
            loggerDebug.warn(e.stack.toString());
            // socketRequest.end()
        }

        socketRequest.write("HTTP/" + request.httpVersion + " 200 Connection established\r\n\r\n")
        // socketRequest.write("HTTP/"+request.httpVersion+" "+res.statusCode+" "+res.statusMessage+"\r\n\r\n")

        // Туннелирование к хосту
        socket.on('data', function(chunk) {
            try {
                socketRequest.write(chunk, 'binary')
            }
            catch (e) {
                loggerDebug.warn(e.stack.toString());
            }
        })

        socket.on('end', function() {
            socketRequest.end()
        })

        socket.on('error', function() {
            // console.log("HTTP/" + request.httpVersion + " 500 Connection error\r\n\r\n")
            loggerError.warn("HTTP/" + request.httpVersion + " 500 Connection error");

            // Сказать клиенту, что произошла ошибка
            socketRequest.write("HTTP/" + request.httpVersion + " 500 Connection error\r\n\r\n")
            socketRequest.end()
        })

        // Туннелирование к клиенту
        socketRequest.on('data', function(chunk) {
            socket.write(chunk, 'binary')
        })

        socketRequest.on('end', function() {
            socket.end()
        })

        socketRequest.on('error', function() {
            socket.end()
        })

    }).end()
}).listen(config.listener.port, config.listener.address);