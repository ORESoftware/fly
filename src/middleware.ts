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
import * as util from "util";

const log = {
  info: console.log.bind(console, chalk.gray.bold('@oresoftware/fly:')),
  error: console.error.bind(console, chalk.magentaBright.underline('@oresoftware/fly error:')),
  warn: console.error.bind(console, chalk.yellow.bold('@oresoftware/fly warning:'))
};

export type FileMatchValidator = (file: string) => boolean;

export interface FlyOptions {
  fileFieldName?: string,
  basePath?: string,
  base?: string,
  extensions?: Array<string>,
  match?: Array<RegExp>,
  notMatch?: Array<RegExp>,
  fileMatchValidator?: FileMatchValidator,
  staticFS?: boolean,
  debug?: boolean
}

export interface IPCMessage {
  id: string,
  absFilePath: string
}

export interface HTTPMethods {
  [index: string]: boolean;
}

const flattenDeep = function (a: Array<any>): Array<any> {
  return a.reduce((acc, val) => Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val), []);
};

const matchingFilter = function (v: any) {
  if (v && !(v instanceof RegExp)) {
    throw new Error('match array must be made up of RegExp instances.');
  }
  return v;
};

export const fly = function (p: string | FlyOptions, opts?: FlyOptions) {
  
  let basePath = '';
  
  if (p && typeof p === 'object') {
    opts = p as FlyOptions;
    basePath = opts.basePath || opts.base;
  }
  else {
    basePath = p as string;
  }
  
  opts = opts || {} as FlyOptions;
  const match = flattenDeep([opts.match]).filter(matchingFilter);
  const notMatch = flattenDeep([opts.match]).filter(matchingFilter);
  const staticFS = opts.staticFS !== false;
  const debug = opts.debug === true || process.env.fly_debug === 'yes';
  
  let extensions = opts.extensions || ['.js'];
  
  if (!Array.isArray(extensions)) {
    throw getCleanTrace(new Error('@oresoftware/fly usage error - "extensions" must be an array.'));
  }
  
  const validator = opts.fileMatchValidator || null;
  const fieldName = opts.fileFieldName || '';
  
  if (fieldName && typeof fieldName !== 'string') {
    throw getCleanTrace(new Error('@oresoftware/fly usage error - if "fieldName" is provided it must be a string.'));
  }
  
  if (validator) {
    assert.equal(typeof validator, 'function', '@oresoftware/fly usage error => "fileMatchValidator" must be a function.')
  }
  
  if (!(basePath && typeof basePath === 'string' && path.isAbsolute(basePath))) {
    throw getCleanTrace(new Error('@oresoftware/fly usage error => "basePath" must be an absolute path.'));
  }
  
  basePath = path.resolve(basePath);
  debug && log.info('the "basePath" for instrumenting js files is:', basePath);
  
  try {
    fs.statSync(basePath);
  }
  catch (err) {
    log.error(chalk.magenta('option "basePath" is an absolute path, but does not exist on your filesystem.'));
    log.error(chalk.magenta('where "basePath" is ', chalk.cyan.bold(basePath)));
    throw getCleanTrace(err);
  }
  
  const hasAcceptableExtension = function (s: string) {
    if (extensions.length < 1) return true;
    return extensions.some(function (ext) {
      return s.endsWith(ext);
    });
  };
  
  const doesMatch = function (s: string) {
    if (match.length < 1) return true;
    return match.some(function (r) {
      return r.test(s);
    })
  };
  
  const doesNotMatch = function (s: string) {
    if (notMatch.length < 1) return true;
    return notMatch.every(function (r) {
      return !r.test(s);
    });
  };
  
  const map = {} as { [key: string]: boolean };
  
  if (staticFS) {
    
    let stdout = '';
    try {
      stdout = String(cp.execSync(`. "$HOME/.gmx/gmx.sh"; gmx waldo ${basePath};\n`) || '').trim();
    }
    catch (err) {
      log.error('could not read from "basePath", where "basePath" is:', basePath);
      throw getCleanTrace(err);
    }
    
    debug && log.info('the following files can be instrumented by istanbul:');
    String(stdout).split('\n').map(v => String(v).trim()).filter(Boolean).forEach(function (v) {
      if (doesMatch(v) && doesNotMatch(v) && hasAcceptableExtension(v)) {
        debug && log.info(chalk.cyan.bold(v));
        map[v] = true;
      }
    });
    
    const ln = Object.keys(map).length;
    log.info('this many files are available to be instrumented by istanbul:', ln);
    if (staticFS) {
      log.info('as an optimization, @oresoftware/fly has a loaded a map of the fs into memory.');
      log.info(`if the static assets on the fs change at runtime, then use ${chalk.blueBright('staticFS: false')}.`);
    }
  }
  
  const k = cp.fork(__dirname + '/child.js');
  
  const methods = <HTTPMethods>{
    'HEAD': true,
    'GET': true
  };
  
  return <RequestHandler> function (req, res, next) {
  
    const method = String(req.method || '').trim().toUpperCase();
  
    if (!methods[method]) {
      return next();
    }
    
    const originalUrl = parseUrl.original(req);
    const id = uuid.v4();
    let absFilePath = '';
    
    if (fieldName && (req as any)[fieldName]) {
      absFilePath = (req as any)[fieldName];
    }
    else {
      absFilePath = parseUrl(req).pathname;
      // make sure redirect occurs at mount
      if (absFilePath === '/' && originalUrl.pathname.substr(-1) !== '/') {
        absFilePath = ''
      }
      absFilePath = path.resolve(basePath + '/' + absFilePath);
    }
    
    if (staticFS) {
      if (!map[absFilePath]) {
        // file was not in the map, so we just continue on
        debug && log.warn('file was not in staticFS map:', absFilePath);
        return next()
      }
      
      k.send({id, absFilePath} as IPCMessage);
      k.send(`handle:${id}`, req.socket);
      return;
    }
    
    fs.stat(absFilePath, function (err, stats) {
      
      if (err) {
        if (debug) {
          log.warn('could not stat file with path:', absFilePath);
          log.warn(err && err.message || err);
        }
        return next();
      }
      
      k.send({id, absFilePath} as IPCMessage);
      k.send(`handle:${id}`, req.socket);
      
    });
    
  }
  
};

export default fly;
