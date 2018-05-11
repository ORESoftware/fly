"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const middleware_1 = require("../dist/middleware");
const path = require("path");
const app = express();
app.use(function (req, res, next) {
    console.log('req.path is 1111:', req.path);
    next();
});
app.use('/', function (req, res, next) {
    console.log('req.path is 2222:', req.path);
    if (String(req.path).endsWith('.js')) {
        next();
    }
    else {
        res.sendFile(path.resolve(process.cwd() + '/zoom.html'));
    }
});
app.use(function (req, res, next) {
    console.log('req.path is 3333:', req.path);
    next();
});
app.use(middleware_1.fly({
    basePath: path.join(__dirname, 'fixtures')
}));
app.use(function (req, res, next) {
    next(new Error('404'));
});
app.use(function (err, req, res, next) {
    res.json({ error: (err && err.stack || err.message) || null });
});
app.listen(4005);