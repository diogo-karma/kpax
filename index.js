/*!
 * kpax - v0.0.2
 * Copyright(c) 2014 Dg Nechtan <dnechtan@gmail.com>
 * MIT Licensed
 */

var debug = require('debug')('kpax');
var util = require('util');
var isp = util.inspect;
var pkg = require('./package.json');
var _ = require('underscore');
module.exports = function (server, options) {

  if (!server) return false;

  function escapeRegExp(string) {
    return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  }

  function newHash(prefix) {
    return '_'.concat(prefix || '',
      new Date() * (pkg.version + Math.random()).replace(/\D/g, ''),
      Math.random().toString(36));
  }

  var verbs = ['get', 'post', 'delete', 'del', 'put', 'head'];
  var kpax = {
    app: {},
    ios: {},
    ioids: {},
    fn: {},
    options: options || {},
    pkg: require('./package.json'),
    _events: {}
  };

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

  kpax.getSocket = function ($io) {
    var socket = null;
    if (kpax.ios.hasOwnProperty($io)) {
      socket = kpax.ios[$io];
    }
    if (kpax.ioids.hasOwnProperty($io)) {
      socket = kpax.ioids[$io];
    }
    return socket;
  }

  kpax.io.sockets.on('connection', function (socket) {

    debug('new connection', socket.id);

    kpax.ios[socket.id] = socket;

    socket.emit('kpax:socket', {
      id: socket.id
    });

    socket.on('kpax:identify', function (data) {
      debug('identify', socket.id, ' to id: ', data);
      kpax.ioids['' + data] = socket;
    });

    socket.on('kpax', function (data) {
      debug('new kpax data', data);
      var req = socket.manager.handshaken[socket.id];
      if (data === Object(data)) {
        data = _.extend({
          params: {},
          data: {}
        }, data);
        if (data.hasOwnProperty('to')) {
          if (data.to === 'all') {
            for (var x in kpax.ios) {
              kpax.emit(kpax.ios[x], data);
            }
          } else {
            kpax.emit(data.to, data);
          }
        }
        if (data.hasOwnProperty('_hash') && kpax.fn.hasOwnProperty(data._hash) && typeof kpax.fn[data._hash] === 'function') {
          var _emit = function (data) {
            socket.emit(data);
          }
          kpax.fn[data._hash].call(socket, data, {
            send: _emit,
            json: _emit,
            emit: _emit
          });
          return (kpax.fn[data._hash] = null) === null;
        }
        if (data.hasOwnProperty('_hash') && data.hasOwnProperty('_key') && util.isArray(kpax._events[data._key])) {
          var resp = {
            _hash: data._hash,
            _cache: data['_cache'] ? data._cache : false,
            ts: +new Date(),
            data: {}
          };
          data = _.extend(data, req);
          kpax._events[data._key].forEach(function (fn) {
            fn.call(socket, data, {
              send: function (respData, params) {
                resp.data = respData;
                resp.params = params || {};
                socket.emit(kpax.pkg.name, resp);
              }
            });
          });
        }
      }
    });

  });

  var $verb = function $verb(verb, key, callback) {
    debug('add $verb', verb, key);
    if (!util.isArray(kpax._events[verb + ':' + key]))
      kpax._events[verb + ':' + key] = [];
    kpax._events[verb + ':' + key].push(callback);
  };

  var $emit = function $emit($io, verb, key, data, params, callback) {
    var hash = null;
    var _key = null;
    var socket = kpax.getSocket($io);

    debug('$emit', verb, key, data, params, callback);

    if (!socket) return false;

    if (typeof verb === 'object') {
      if (verb.hasOwnProperty('_key')) {
        _key = verb._key;
      }
      if (verb.hasOwnProperty('_hash')) {
        hash = verb._hash;
      }
      if (verb.hasOwnProperty('params')) {
        params = verb.params;
      }
      if (verb.hasOwnProperty('data')) {
        data = verb.data;
      }
      callback = function (req, res) {
        debug('callback for emit.to', req, res);
      }
    }

    if (typeof params === 'function') {
      callback = params;
      params = {};
    }

    if (!hash) {
      hash = newHash();
    }

    kpax.fn[hash] = callback || angular.noop;
    socket.emit('kpax', {
      _hash: hash,
      _key: _key || (verb + ':' + key),
      params: params || {},
      data: data || {}
    });
  };

  verbs.map(function (verb) {
    kpax[verb] = $verb.bind(this, verb);
    kpax.app['__' + verb] = kpax.app[verb];
    kpax.app[verb] = function () {
      var fn = kpax.app['__' + verb],
        context = kpax.app;
      if (arguments[0] === kpax.options.schema && typeof arguments[1] === 'string') {
        arguments = [].slice.call(arguments, 1);
        fn = kpax[verb];
        context = kpax;
      } else if (new RegExp('^' + escapeRegExp(kpax.options.schema)).test(arguments[0])) {
        arguments[0] = arguments[0].substr(kpax.options.schema.length);
        fn = kpax[verb];
        context = kpax;
      }
      return fn.apply(context, arguments);
    }
  });

  kpax.app.kpax = kpax;
  kpax.client = require('./client');
  kpax.emit = kpax.send = $emit.bind(kpax);

  return kpax;

}
