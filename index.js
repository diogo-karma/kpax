/*!
 * kpax - v0.0.1
 * Copyright(c) 2014 Dg Nechtan <dnechtan@gmail.com>  (http://nechtan.github.io)
 * MIT Licensed
 */

var debug = require('debug')('kpax');
var util = require('util');
var isp = util.inspect;
var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');

module.exports = function(server, options) {

  if (!server) return false;

  function _escapeRegExp(string) {
    return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  }

  var reqKeys = ['_hash', '_cache', 'params', 'ts', 'data', 'headers', 'address', 'time', 'xdomain', 'secure', 'issued', 'session', 'user'];

  var verbs = ['get', 'post', 'delete', 'del', 'put', 'head'];
  var kpax = {
    app: {},
    ios: {},
    options: options || {},
    pkg: require('./package.json'),
    _events: {}
  };

  kpax.on = function kpaxOn(event, callback) {
    kpax._events[event] = callback;
  }

  kpax.options.schema = kpax.options.schema || 'kpax:';

  // support for ExpressJS
  if (!kpax.options.app && server._events && server._events.request && server._events.request.name === 'app') {
    kpax.app = server._events.request
  }

  // bind kpax to socket.io
  if (kpax.options.io) {
    kpax.io = kpax.options.io;
    if (!kpax.io.sockets) kpax.io = kpax.io.listen(server);
  } else {
    kpax.io = require('socket.io').listen(server);
  }

  // kpax.io.set('resource', '/test');

  // Recommended production settings by default
  kpax.io.enable('browser client minification');
  kpax.io.enable('browser client etag');
  kpax.io.enable('browser client gzip');
  kpax.io.set('log level', 1);
  kpax.io.set('transports', [
      'websocket'
    , 'flashsocket'
    , 'htmlfile'
    , 'xhr-polling'
    , 'jsonp-polling'
  ]);

  //throw new Error('Required option `data` missing');

  kpax.io.sockets.on('connection', function(socket) {

    debug('new connection', socket.id);

    var handshaken = kpax.io.handshaken[socket.id];

    if (typeof kpax._events['connection'] === 'function')
      if (false === kpax._events['connection'].call(socket, _.pick(handshaken, reqKeys))) return false;

    socket.on('kpax', function(data) {
      debug('socket kpax', data);
      if (data === Object(data) && data.hasOwnProperty('_hash') && data.hasOwnProperty('_key') && util.isArray(kpax._events[data._key])) {
        var resp = {
          _hash: data._hash,
          _cache: data['_cache'] ? data._cache : false,
          ts: +new Date(),
          data: {}
        };
        var res = {
          send: function(respData) {
            resp.data = respData;
            socket.emit(kpax.pkg.name, _.omit(resp, 'headers', 'adddress', 'xdomain', 'session', 'user', 'address'));
          }
        };
        res.json = res.emit = res.send;
        kpax._events[data._key].forEach(function(fn) {
          fn.call(socket, _.extend(resp, {
            params: data.params
          }, _.pick(handshaken, reqKeys)), res);
        });
      }
    });

  });

  var $verb = function $verb(verb, key, callback) {
    debug('add verb', verb, key);
    if (!util.isArray(kpax._events[verb + ':' + key]))
      kpax._events[verb + ':' + key] = [];
    kpax._events[verb + ':' + key].push(callback);
  };

  verbs.map(function(verb) {
    kpax[verb] = $verb.bind(this, verb);
    kpax.app['__' + verb] = kpax.app[verb];
    kpax.app[verb] = function() {
      var fn = kpax.app['__' + verb],
        context = kpax.app;
      if (arguments[0] === kpax.options.schema && typeof arguments[1] === 'string') {
        arguments = [].slice.call(arguments, 1);
        fn = kpax[verb];
        context = kpax;
      } else if (new RegExp('^' + _escapeRegExp(kpax.options.schema)).test(arguments[0])) {
        arguments[0] = arguments[0].substr(kpax.options.schema.length);
        fn = kpax[verb];
        context = kpax;
      }
      return fn.apply(context, arguments);
    }
  });

  kpax.app.kpax = kpax;

  return kpax;

}
