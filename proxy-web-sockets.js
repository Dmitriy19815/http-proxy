/**
 * Created by farafonov-dv on 28.10.2016.
 */
var http = require('http'),
    net = require('net'),
    sockjs = require('sockjs'),
    _ADDR = "185.82.212.95",
    _PORT = 8080,
    server = sockjs.createServer();

server.on('connection', function(conn) {
    // при подключении клиента создается экземпляр функции с аргументом - SockJS объект подключения

    // создаем новый класс, который будет обрабатывать поток асинхронного трафика,
    // при создании перехватываем возможную ошибку, если сервер данных недоступен
    var com = new Commander(_ADDR, _PORT, conn,
        function(e) {
            console.log("! We had an Error in socket: ", e, "at ", new Date());
            conn.close();
        }
    );

    conn.on('data', function(data) {
        // при получении команды от браузера клиента в формате JSON
        // парсим ответ и выбираем действие согласно команды
        var dat = JSON.parse(data);

        if(dat.command == "@auth") {
            // логинимся к серверу данных,
            com.auth(dat.param.log, dat.param.pwd);
        } else
        if(dat.command == "@bye") {
            // веб-клиент решил завершить рабту с потоком
            com.bye();
            conn.close();
        }
    });

    conn.on('close', function() {
        console.log("Websocket connection closed");
        com = null;
    });
});

// создаем объект-HTTP-сервер и вешаем на него обработчик вебсокетных соединений
// SockJS, привязанный к адресу http://mydomen.com:8081/data
var srv = http.createServer();
server.installHandlers(srv, {prefix:'/data'});
srv.listen(8081, '0.0.0.0');

var Commander = function (adr, port, clientConn, onError) {
// создаем прямое сокетное подключение к серверу данных
    var self = this;
    this.status = 0;
    this.chunk = ""; 	// цепочка символов текущего ответа
    this.answers = [];	// массив строк ответов сервера данных
    this.connection = clientConn; 	// ссылка на вебсокетное подключение,
    // туда мы будем проксировать ответы сервера данных
    this.client = new net.Socket();	// клиент подключения к серверу данных

    this.client.connect(port,adr,function(){
        // подключаемся к серверу данных
        console.log("New connect to created...");
    });

    this.client.on('data', function(data) {
        // при поступлении асинхронных данных от сервера данных вызываем функцию-оработчик
        self.onData(data);
    });

    this.client.on('error', function(e) {
        // ловим ошибку и рвем связь
        onError(e);
        self.client.destroy();
    });

};

Commander.prototype.auth = function(login, pass) {
    // аутентифицируемся на сервере данных и запишем пользователя в консоль для контроля
    console.log("written auth for "+ login);
    this.client.write('(auth "'+login+'" "'+pass+'")\n');
};

Commander.prototype.bye = function() {
    // отключаемся от сервера данных
    this.client.write('(exit)\n');
};

Commander.prototype.onData = function(data) {
    // данные приходят из сокета в виде цепочек, которые необходимо клеить до тех пор,
    // пока не появится стоп-символ, обычно это код конца строки
    // когда конец строки появился, передаем склеенные цепочки через вебсокетное соединение
    // на наш веб-клиент и обнуляем цепочку для записи следующей строки
    var pos;
    this.chunk+=data.toString();
    pos=this.chunk.indexOf('\n');
    if(pos > -1) {
        this.connection.write(this.chunk.substring(0,pos));
        this.chunk = this.chunk.substring(pos);
    }
};
