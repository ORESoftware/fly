'use strict';

import express = require('express');
import {RequestHandler} from "express";
import cp = require('child_process');
import uuid = require('uuid');
import {customStringify} from "./utils";
import path = require('path');
import * as assert from "assert";
import parseUrl = require('parseurl');
import * as fs from "fs";
import chalk from 'chalk';
import {getCleanTrace} from "clean-trace";

const log = {
  info: console.log.bind(console, chalk.gray.bold('@oresoftware/fly:')),
  error: console.error.bind(console, chalk.magentaBright.underline('@oresoftware/fly error:')),
  warn: console.error.bind(console, chalk.yellow.bold('@oresoftware/fly warning:'))
};

export type FileMatchValidator = (file: string) => boolean;

export interface FlyOptions {
  fileFieldName?: string,
  basePath: string,
  extensions?: Array<string>,
  match?: Array<RegExp>,
  notMatch?: Array<RegExp>,
  fileMatchValidator?: FileMatchValidator
}

export interface IPCMessage {
  id: string,
  absFilePath: string
}

export const fly = function (opts: FlyOptions) {
  
  opts = opts || {} as FlyOptions;
  
  let basePath = opts.basePath;
  const validator = opts.fileMatchValidator || null;
  
  if (validator) {
    assert.equal(typeof validator, 'function', '@oresoftware/fly error => "fileMatchValidator" must be a function.')
  }
  
  if (!(basePath && typeof basePath === 'string' && path.isAbsolute(basePath))) {
    throw new Error('@oresoftware/fly error => "basePath" must be an absolute path.');
  }
  
  basePath = path.resolve(basePath);
  
  try {
    fs.statSync(basePath);
  }
  catch (err) {
    log.error(chalk.magenta('option "basePath" is an absolute path, but does not exist on your filesystem.'));
    log.error(chalk.magenta('where "basePath" is ', chalk.cyan.bold(basePath)));
    throw getCleanTrace(err);
  }
  
  const fieldName = opts.fileFieldName || '';
  const k = cp.fork(__dirname + '/child.js');
  
  return <RequestHandler> function (req, res, next) {
    
    const originalUrl = parseUrl.original(req);
    
    const id = uuid.v4();
    let absFilePath = null;
    
    if (fieldName && (req as any)[fieldName]) {
      absFilePath = (req as any)[fieldName];
    }
    else {
      absFilePath = parseUrl(req).pathname;
      
      console.log('absFilePath 111:', absFilePath);
      // make sure redirect occurs at mount
      if (absFilePath === '/' && originalUrl.pathname.substr(-1) !== '/') {
        absFilePath = ''
      }
      absFilePath = path.resolve(basePath + '/' + absFilePath);
      console.log('absFilePath 222:', absFilePath);
    }
    
    k.send({id, absFilePath} as IPCMessage);
    k.send(`handle:${id}`, req.socket);
    
  }
  
};
