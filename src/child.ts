#!/usr/bin/env node
'use strict';

import * as util from "util";
import {Socket} from "net";
import {IPCMessage} from "./middleware";
import {getStream} from "../dist/fly";
const hash = new Map();
import fs = require('fs');

const writeResponse = function (s: Socket, file: string) {
  
  s.write([
    'HTTP/1.1 200 OK',
    'Content-Type: text/javascript; charset=UTF-8',
    'Content-Encoding: UTF-8',
    'Accept-Ranges: bytes',
    'Connection: keep-alive',
  ].join('\n') + '\n\n');
  
  console.log('file that we got:', file);
  
  getStream(file)
    .once('error', function (e: any) {
      s.end('error: ' + e && e.stack || e.message || util.inspect(e));
    })
    .pipe(s)
    .once('error', function (e: any) {
      s.end('error: ' + e && e.stack || e.message || util.inspect(e));
    });
  
  // s.end(message);
  
};

const handleSocket = function (id: string, s: Socket) {
  
  const v = hash.get(id) as IPCMessage;
  
  if (!v) {
    hash.set(id, s);
    return;
  }
  
  writeResponse(s, v.absFilePath);
  
};

const handleMessage = function (id: string, m: IPCMessage) {
  
  const socket = hash.get(id);
  
  if (!socket) {
    hash.set(id, m);
    return;
  }
  
  writeResponse(socket, m.absFilePath);
};

process.on('message', function (m, socket) {
  
  if (typeof m === 'string' && String(m).startsWith('handle:')) {
    const id = String(m).split('handle:')[1];
    handleSocket(id, socket);
  }
  else if (m && typeof m.id === 'string') {
    handleMessage(m.id, m);
  }
  else {
    throw new Error('message was unrecognized: ' + util.inspect(m));
  }
  
});


