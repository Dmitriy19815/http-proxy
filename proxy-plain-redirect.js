/**
 * Created by farafonov-dv on 17.10.2016.
 */
var http = require('http')
var url = require('url')
var fs = require('fs');
var log4js = require('log4js');

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

var server = http.createServer(
    function(request, response) {
        console.log(request.url)

        var ph = url.parse(request.url)
        var options = {
            port: ph.port,
            hostname: ph.hostname,
            method: request.method,
            path: ph.path,
            headers: request.headers
        }

        var proxyRequest = http.request(options)

        proxyRequest.on('response',
            function(proxyResponse) {
                proxyResponse.on('data', function(chunk) {
                    response.write(chunk, 'binary')
                })

            proxyResponse.on('end', function() {
                response.end()
            })

            response.writeHead(proxyResponse.statusCode, proxyResponse.headers)
        })

        request.on('data', function(chunk) {
            proxyRequest.write(chunk, 'binary')
        })

        request.on('end', function() {
            proxyRequest.end()
        })
}).listen(config.listener.port)