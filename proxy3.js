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

/*
var log4js2 = require("log4js");

    log4js2.loadAppender("file");
    log4js2.addAppender(log4js.appenders.file("./logs/redirect-proxy.log"), "redirect-proxy");

var logger = log4js2.getLogger("redirect-proxy");
*/

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
    loggerDebug.trace(options);

    var gatewayRequest = http.request(options)

    gatewayRequest.on('error', function(err) {
        // console.log(err);
        loggerError.warn(err.toString());
        response.end()
    })

    gatewayRequest.on('response', function(gatewayResponse) {
        if ((gatewayResponse.statusCode === 403) || (gatewayResponse.statusCode === 407)) {
            // console.log("[error] AUTH REQUIRED: "+gatewayResponse.statusCode+" "+gatewayResponse.statusMessage);
            loggerError.error(gatewayResponse.statusCode+" "+gatewayResponse.statusMessage);
        }

        gatewayResponse.on('data', function(chunk) {
            response.write(chunk, 'binary')
        })

        gatewayResponse.on('end', function() {
            response.end()
        })

        response.writeHead(gatewayResponse.statusCode, gatewayResponse.headers)
    })

    request.on('data', function(chunk) {
        gatewayRequest.write(chunk, 'binary')
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

    if(gw.auth)
        options.headers['Proxy-Authorization'] = 'Basic ' + new Buffer(gw.auth).toString('base64')

    // console.log(options)
    loggerDebug.trace(options);

    var gatewayRequest = http.request(options)

    gatewayRequest.on('error', function(err) {
        // console.log('[error] ' + err);
        loggerError.error(err.toString());
        // process.exit()
    })

    gatewayRequest.on('connect', function(res, socket, head) {

        // assert.equal(res.statusCode, 200)
        // assert.equal(head.length, 0)

        if (!(res.statusCode === 200)) {
            // console.log("[error]: "+res.statusCode+" "+res.statusMessage);
            loggerError.warn("HTTP/" + request.httpVersion+" "+res.statusCode+" "+res.statusMessage);
            socketRequest.end()
        }
        else {
            // console.log("HTTP/"+request.httpVersion+" "+res.statusCode+" "+res.statusMessage);
            loggerInfo.info("HTTP/" + request.httpVersion+" "+res.statusCode+" "+res.statusMessage);
        }

        // socketRequest.write("HTTP/" + request.httpVersion + " 200 Connection established\r\n\r\n")
        socketRequest.write("HTTP/"+request.httpVersion+" "+res.statusCode+" "+res.statusMessage+"\r\n\r\n")

        // Туннелирование к хосту
        socket.on('data', function(chunk) {
            socketRequest.write(chunk, 'binary')
        })

        socket.on('end', function() {
            socketRequest.end()
        })

        socket.on('error', function() {
            // console.log("HTTP/" + request.httpVersion + " 500 Connection error\r\n\r\n")
            loggerError.error("HTTP/" + request.httpVersion + " 500 Connection error\r\n\r\n");

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