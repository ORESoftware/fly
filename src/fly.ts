'use strict';

import fs = require('fs');
import path = require('path');
import istanbul = require('istanbul');
const instrumenter = new istanbul.Instrumenter();
import {Transform} from "stream";

export const getStream = function (file: string) {
  
  const filename = path.basename(file);
  
  const t = new Transform({
    writableObjectMode: true,
    
    transform(chunk, encoding, callback) {
      // Push the data onto the readable queue.
      callback(null, chunk);
    }
  });
  
  let data = '';
  
  fs.createReadStream(file)
    .once('error', function (e) {
      this.removeAllListeners();
      t.emit('error', e);
    })
    .on('data', function (d) {
      data += String(d);
    })
    .once('end', function () {
      
      instrumenter.instrument(data, filename, function (err, generatedCode) {
        
        if (err) {
          return t.emit('error', err);
        }
        
        t.write(String(generatedCode));
        t.end();
        
      });
      
    });
  
  return t;
  
};

export default getStream;



