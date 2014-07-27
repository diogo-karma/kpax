/*!
 * kpax - v0.0.5
 * Copyright(c) 2014 Dg Nechtan <dnechtan@gmail.com>
 * MIT Licensed
 */

var debug = require('debug')('kpax');
var util = require('util');
var isp = util.inspect;
var pkg = require('./package.json');
var _ = require('underscore');

module.exports = function(server, options) {

  if (!server) return false;

  function escapeRegExp(string) {
    return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  }

  function newHash(prefix) {
    return '_'.concat(prefix || '',
      Math.abs(Math.random() * Math.random() * Date.now() | 0),
      new Date() * Math.random(),
      Math.random().toString(36));
  }

  var iVerbs = ['get', 'head'];
  var oVerbs = ['post', 'delete', 'del', 'put'];
  var verbs = iVerbs.concat(oVerbs);
  var cHeaders = {};
  var headerParser = null;
  var kpax = {
    app: {},
    ios: {},
    ioids: {},
    fn: {},
    options: _.extend({
        forceParsedHeader: false,
        schema: 'kpax:'
      },
      options || {}),
    pkg: require('./package.json'),
    _events: {},
    _offs: []
  };

  kpax.registerHeaderParser = function(fn) {
    headerParser = fn;
  };

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
    'websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling'
  ]);

  debug('kpax with options', kpax.options);

  kpax.onDisconnect = function(fn) {
    if (_.isFunction(fn)) {
      kpax._offs.push(fn);
    }
  }

  kpax.getSocket = function($io) {
    var socket = [];
    if (kpax.ios.hasOwnProperty($io)) {
      return [kpax.ios[$io]];
    }
    if (kpax.ioids.hasOwnProperty($io)) {
      sockets = kpax.ioids[$io];
      for (var s, x = 0; x < sockets.length; x++) {
        if (s = kpax.ios[sockets[x]]) {
          // debug('socket found', x, s, s.socket['connected']);
          // if (s.hasOwnProperty('socket') && s.socket['connected']) {
          debug('socket connected', x);
          socket.push(s);
          // } else {
          //   debug('socket disconnected', x, 'sliced');
          //   kpax.ioids[$io].slice(x, 1);
          // }
        }
      }
    }
    return socket;
  }

  kpax.io.sockets.on('connection', function(socket) {

    var cIndentify = null;

    debug('new connection', socket.id);

    kpax.ios[socket.id] = socket;

    if (socket.manager.handshaken[socket.id]) {
      cHeaders[socket.id] = socket.manager.handshaken[socket.id];
      if (_.isFunction(headerParser)) {
        headerParser(socket.manager.handshaken[socket.id], function(header) {
          // debug('new header connection', header);
          cHeaders[socket.id] = header;
        });
      }
    }

    socket.on('disconnect', function() {
      debug('socket disconnected', socket.id, cIndentify);
      if (util.isArray(kpax._offs)) {
        for (var x = 0; x < kpax._offs.length; x++) {
          kpax._offs[x](kpax.ioids[cIndentify], cHeaders[socket.id]);
        }
      }
      if (util.isArray(kpax.ioids[cIndentify])) {
        for (var x = kpax.ioids[cIndentify].length; x--;) {
          if (kpax.ioids[cIndentify][x] === socket.id) {
            kpax.ioids[cIndentify].splice(x, 1);
          }
        }
      }
    });

    socket.emit('kpax:connect', {
      id: socket.id
    });

    socket.on('kpax:identify', function(data) {
      if (!util.isArray(kpax.ioids[(cIndentify = '' + data)])) {
        kpax.ioids[cIndentify] = [];
      }
      kpax.ioids[cIndentify].push(socket.id);
      debug('identify', socket.id, 'to id:', cIndentify, 'all:', kpax.ioids[cIndentify]);
    });

    socket.on('kpax', function(data) {

      // debug('new kpax data', data);
      // debug('all functions cb', kpax.fn);

      var req = cHeaders[socket.id];

      if (data === Object(data)) {

        data = _.extend({
          params: {},
          data: {}
        }, data);

        // redirect data to socket
        if (data['to']) {

          debug('data to', data.to);

          var nhash = socket.id + ':' + data._hash;
          var ndata = {
            _hash: nhash,
            _key: data._key,
            _cache: data['_cache'] || false,
            ts: +new Date(),
            data: data['data'] || {},
            params: data['params'] || {},
            from: req,
            from_socket: socket.id,
            to: data.to
          };
          ndata.complete = function(req, res) {
            req._hash = data._hash;
            // debug('triangle callback ndata', req);
            socket.emit('kpax', req);
          }
          if (data.to === 'all') {
            debug('data to all', kpax.ios.length);
            for (var x in kpax.ios) {
              kpax.emit(kpax.ios[x], ndata);
            }
          }
          if (kpax.ioids[data.to]) {
            kpax.emit(data.to, ndata);
          }
        }

        // local request
        if (data.hasOwnProperty('_hash') && util.isArray(kpax.fn[data._hash])) {
          var _emit = function(data) {
            socket.emit(data);
          }
          for (var x = 0, m = kpax.fn[data._hash].length; x < m; x++) {
            kpax.fn[data._hash][x].call(socket, data, {
              send: _emit,
              json: _emit,
              emit: _emit
            });
          }
          return (kpax.fn[data._hash] = null) === null;
        }

        // remote request
        if (data.hasOwnProperty('_hash') && data.hasOwnProperty('_key') && util.isArray(kpax._events[data._key])) {
          var resp = {
            _hash: data._hash,
            _cache: data['_cache'] ? data._cache : false,
            ts: +new Date(),
            data: {}
          };
          data = _.extend(data, req);
          for (var x = 0, m = kpax._events[data._key].length; x < m; x++) {
            kpax._events[data._key][x].call(socket, data, {
              send: function(respData, params) {
                resp.data = respData;
                resp.params = params || {};
                socket.emit(kpax.pkg.name, resp);
              }
            });
          }
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
    var from = {};
    var from_socket = null;
    var fromTo = false;
    var sockets = kpax.getSocket($io);

    debug('$emit', verb, key, data, params, callback);

    if (!util.isArray(sockets) || sockets.length < 1) return false;

    if (_.isFunction(callback)) callback = [callback];
    if (!callback) callback = [];

    if (typeof verb === 'object') {
      fromTo = !!verb['to'];
      if (verb.hasOwnProperty('_key')) {
        _key = verb._key;
      }
      if (verb.hasOwnProperty('from')) {
        from = verb.from;
        from_socket = verb['from_socket'];
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
      if (verb.hasOwnProperty('success')) {
        callback.push(verb.success);
      }
      if (_.isFunction(key)) {
        callback.push(key);
      }
      if (verb.hasOwnProperty('complete')) {
        callback.push(verb.complete);
      }
    }

    if (_.isFunction(params)) {
      callback.push(params);
      params = {};
    }

    if (!hash) {
      hash = newHash();
    }

    kpax.fn[hash] = callback;

    // debug('fn[hash]', hash, kpax.fn[hash]);
    var toSendData, x;

    if (from_socket && kpax.options.forceParsedHeader && (!cHeaders[from_socket] || (!cHeaders[from_socket]['user'] || !cHeaders[from_socket].user['_id']))) {
      debug('FORCED header connection');
      headerParser(cHeaders[from_socket], function(header) {
        debug('parsed', 12039210931029301923, header);
        cHeaders[from_socket] = header;
        from = header;
        socketEmit();
      });
    } else {
      socketEmit();
    }

    function socketEmit() {
      for (var x = 0; x < sockets.length; x++) {
        if (sockets[x] && _.isFunction(sockets[x]['emit'])) {
          toSendData = _.extend(cHeaders[sockets[x].id], {
            _hash: hash,
            _key: _key || (verb + ':' + key),
            params: params || {},
            data: data || {},
            from: from
          });
          debug('sockets[x]', x, sockets[x].id, toSendData);
          sockets[x].emit('kpax', toSendData);
        }
      }
    }

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
