var localVideo = document.querySelector('video#localVideo');
var remoteVideo = document.querySelector('video#remoteVideo');

var shareDeskBox = document.querySelector('input#shareDesk');

var btnCall = document.querySelector('button#call');
var btnLeave = document.querySelector('button#leave');
var btnOnline = document.querySelector('button#online');
var btnOffline = document.querySelector('button#offline');

// 信令服务器socket
var socket;

// peerConnection
var peerConnection;

// 本地音视频流
var localStream;

// 远程音视频流
var remoteStream;

var  tmp = null;
// 房间ID
var roomId = (tmp = getQueryVariable('room')) ? tmp : "111111";

var state = 'init';

// peerConnection配置
const peerConnectionConfigs = {
    'iceServers': [{
        'urls': 'turn:webrtc.phpisfuture.com:3478',
        'credential': "weilai",
        'username': "123456"
    }],
};

function getQueryVariable(variable)
{
    var query = window.location.search.substring(1);
    var vars = query.split("&");
    for (var i=0;i<vars.length;i++) {
        var pair = vars[i].split("=");
        if(pair[0] === variable){return pair[1];}
    }
    return false;
}

// 音视频呼叫
function call() {
    getLocalMedia();
}

// 媒体协商发送offer
function sendOffer(roomId) {
    if (state === 'joined_conn') {
        var offerOptions = {
            offerToReceiveVideo: 1,
            offerToReceiveAudio: 1
        };

        // 创建offer
        peerConnection.createOffer(offerOptions)
            .then(function (desc) {
                // 设置自身信息并通过ice框架stun与turn服务发送bind request收集Candidate候选者
                peerConnection.setLocalDescription(desc);
                console.log("offer type and sdp", desc);
                // 发送offer sdp信息到信令服务器
                sendMessage(roomId, desc);
            })
            .catch(function (error) {
                console.error('Failed to create offer:', error);
            });
    }
}

// 媒体协商发送answer
function sendAnswer(roomId) {
    var answerOptions = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1
    };
    // 创建answer
    peerConnection.createAnswer(answerOptions)
        .then(function (desc) {
            // 设置自身信息并通过ice框架stun与turn服务发送bind request收集Candidate候选者
            peerConnection.setLocalDescription(desc);
            console.log("answer type and sdp", desc);
            // 发送answer sdp信息到信令服务器
            sendMessage(roomId, desc);
        })
        .catch(function (error) {
            console.error('Failed to create answer:', error);
        });
}

// 创建createPeerConnection并绑定事件
function createPeerConnection(roomId) {
    console.log('create RTCPeerConnection!');
    peerConnection = new RTCPeerConnection(peerConnectionConfigs);
    // onicecandidate事件处理(当收集到候选者时，发送candidate到信令服务器)
    peerConnection.onicecandidate = function (iceCandidate) {
        if (iceCandidate.candidate) {
            sendMessage(roomId, {
                type: 'candidate',
                sdpMLineIndex: iceCandidate.candidate.sdpMLineIndex,
                sdpMid: iceCandidate.candidate.sdpMid,
                candidate: iceCandidate.candidate.candidate
            })
        } else {
            console.log('this is the end candidate');
        }
    };
    // ontrack事件处理(当收到媒体轨数据时)
    peerConnection.ontrack = function (e) {
        remoteStream = e.streams[0];
        remoteVideo.srcObject = remoteStream;
    };
}

// 绑定媒体轨
function bindTracks() {
    console.log('bind tracks into RTCPeerConnection!');

    if (peerConnection === null || peerConnection === undefined) {
        console.error('pc is null or undefined!');
        return;
    }

    if (localStream === null || localStream === undefined) {
        console.error('localstream is null or undefined!');
        return;
    }

    // 添加所有需要的轨道(可以筛选必要的轨道)到peerConnection(注意要先绑定媒体轨，在进行媒体协商)
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });
}

// 绑定信令处理，并发送加入消息
function signal() {

    // 自己加入成功
    socket.on("joined", function (roomId, socketId) {
        console.log('receive joined message!', roomId, socketId);
        state = 'joined';
        // 创建createPeerConnection并绑定事件
        createPeerConnection(roomId);
        // 绑定媒体轨
        bindTracks();
    });

    // 其他人加入
    socket.on("otherjoin", function (roomId) {

        // 如果对方挂断后需要重新创建peerConnection
        if (state === 'joined_unbind') {
            createPeerConnection();
            bindTracks();
        }
        state = 'joined_conn';
        // 发送offer
        sendOffer(roomId);
    });

    // 房间已满
    socket.on('full', (roomId, socketId) => {
        console.log('receive full message', roomId, socketId);
        state = 'leaved';
        offline();
        alert('the room is full!');
    });

    // 离开房间
    socket.on("leaved", function (roomId, socketId) {
        console.log('receive leaved message', roomId, socketId);
        state = 'leaved';
        socket.disconnect();
    });

    // 如果对方离开
    socket.on("bye", function (roomId, socketId) {
        console.log('receive bye message', roomId, socketId);
        state = 'joined_unbind';
        peerConnection.close();
    });

    // 断开链接
    socket.on('disconnect', (socket) => {
        console.log('receive disconnect message!', socket.id);
        if (!(state === 'leaved')) {
            offline();
        }
        state = 'leaved';
    });

    // 收到消息
    socket.on("message", function (roomId, data) {
        console.log('receive message!', roomId, data);
        if (data === null || data === undefined) {
            console.error('the message is invalid!');
            return;
        }
        // 收到offer
        if (data.hasOwnProperty('type') && data.type === 'offer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data));
            sendAnswer(roomId);
        }
        // 收到answer
        else if (data.hasOwnProperty('type') && data.type === 'answer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        }
        // 收到 candidate
        else if (data.hasOwnProperty('type') && data.type === 'candidate') {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: data.sdpMLineIndex,
                sdpMid: data.sdpMid,
                candidate: data.candidate
            });
            // 添加candidate到peerConnection候选者列表中
            peerConnection.addIceCandidate(candidate);
        }
    });

    // 发送加入消息
    socket.emit("join", roomId);
}

//如果返回的是false说明当前操作系统是手机端，如果返回的是true则说明当前的操作系统是电脑端
function IsPC() {
    var userAgentInfo = navigator.userAgent;
    var Agents = ["Android", "iPhone", "SymbianOS", "Windows Phone", "iPad", "iPod"];
    var flag = true;

    for (var v = 0; v < Agents.length; v++) {
        if (userAgentInfo.indexOf(Agents[v]) > 0) {
            flag = false;
            break;
        }
    }

    return flag;
}

function shareDesk() {

    if (IsPC()) {
        navigator.mediaDevices.getDisplayMedia({video: true})
            .then(function (stream) {
                localStream = stream;
            })
            .catch(function (error) {
                alert('Failed to get Media Stream!' + error);
            });

        return true;
    }

    return false;

}

// 获取媒体流
function getLocalMedia() {
    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {
        console.error('the getUserMedia is not supported!');
    } else {
        var constraints;
        // 如果分享屏幕
        if (shareDeskBox.checked && shareDesk()) {
            constraints = {
                video: false,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                }
            }
        } else {
            constraints = {
                video: true,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                }
            }
        }
        // 获取媒体流
        navigator.mediaDevices.getUserMedia(constraints)
            .then(function (mediaStream) {
                // 如果本地流存在(是桌面采集流)
                if (localStream) {
                    // 将音频流添加到媒体轨中
                    mediaStream.getAudioTracks().forEach((track) => {
                        localStream.addTrack(track);
                        // 移除采集到的mediaStream媒体轨
                        mediaStream.removeTrack(track);
                    });
                } else {
                    // 储存本地媒体流信息
                    localStream = mediaStream;
                }
                // 绑定信令处理，并发送加入消息
                signal();
                localVideo.srcObject = localStream;
            })
            .catch(function (error) {
                alert('Failed to get Media Stream!' + error);
            });
    }
}

// 发送消息到信令服务器
function sendMessage(roomId, data) {
    console.log('send message to other end', roomId, data);
    if (!socket) {
        console.log('socket is reconnect');
        online();
        socket.emit("join", roomId);
    }
    socket.emit('message', roomId, data);
}


// 挂断
function leave() {
    if (socket) {
        // 发送离开消息
        socket.emit('leave', roomId); //notify server
    }

    if (peerConnection) {
        // 关闭链接
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream && localStream.getTracks()) {
        // 停止本地音视频流轨
        localStream.getTracks().forEach((track) => {
            track.stop();
        });
    }

    localStream = null;

    alert("leave success");
}

// 上线
function online() {
    if (!socket) {
        // 链接信令服务器
        socket = io.connect();
        alert("online success");
    }
}

// 下线
function offline() {
    leave();
    if (socket) {
        // 断开信令服务器
        socket.disconnect();
        socket = null;
        alert("offline success");
    }
}

btnOnline.onclick = online;
btnCall.onclick = call;
btnLeave.onclick = leave;
btnOffline.onclick = offline;

