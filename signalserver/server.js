'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');

var express = require('express');
var serveIndex = require('serve-index');

//socket.io
var socketIo = require('socket.io');

//
var log4js = require('log4js');

log4js.configure({
    appenders: {
        file: {
            type: 'file',
            filename: 'app.log',
            layout: {
                type: 'pattern',
                pattern: '%r %p - %m',
            }
        }
    },
    categories: {
        default: {
            appenders: ['file'],
            level: 'debug'
        }
    }
});

var logger = log4js.getLogger();

const USERCOUNT = 3;

var app = express();
app.use(serveIndex('./public'));
app.use(express.static('./public'));

//http server
var http_server = http.createServer(app);
http_server.listen(8888, '0.0.0.0');

var options = {
    key: fs.readFileSync('./cert/2_webrtc.phpisfuture.com.key'),
    cert: fs.readFileSync('./cert/1_webrtc.phpisfuture.com_bundle.crt')
};
//https server
var https_server = https.createServer(options, app);
var io = socketIo.listen(https_server);

io.sockets.on('connection', (socket)=> {

    // 收到message消息
    socket.on('message', (room, data)=>{
        // 给room房间所有人除了自己（发送者）发送消息
        socket.to(room).emit('message',room, data);
    });

    socket.on('join', (room)=>{
        socket.join(room);
        var myRoom = io.sockets.adapter.rooms[room];
        var users = (myRoom)? Object.keys(myRoom.sockets).length : 0;
        logger.debug('the user number of room is: ' + users);

        if(users < USERCOUNT){
            socket.emit('joined', room, socket.id); //发给除自己之外的房间内的所有人
            if(users > 1){
                // 给room房间所有人除了自己（发送者）发送otherjoin消息
                socket.to(room).emit('otherjoin', room, socket.id);
            }
        }else{
            socket.leave(room);
            // 给自己（发送者）发送full消息
            socket.emit('full', room, socket.id);
        }
        //socket.emit('joined', room, socket.id); //发给自己
        //socket.broadcast.emit('joined', room, socket.id); //发给除自己之外的这个节点上的所有人
        //io.in(room).emit('joined', room, socket.id); //发给房间内的所有人
    });

    socket.on('leave', (room)=>{
        var myRoom = io.sockets.adapter.rooms[room];
        var users = (myRoom)? Object.keys(myRoom.sockets).length : 0;
        logger.debug('the user number of room is: ' + (users-1));
        //socket.emit('leaved', room, socket.id);
        //socket.broadcast.emit('leaved', room, socket.id);
        // 给room房间所有人除了自己（发送者）发送bye消息
        socket.to(room).emit('bye', room, socket.id);
        // 给自己（发送者）发送leaved消息
        socket.emit('leaved', room, socket.id);
        //io.in(room).emit('leaved', room, socket.id);
    });

});

https_server.listen(4433, '0.0.0.0');
