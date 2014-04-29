/*!
 * kpax v0.0.2 node-client
 * Copyright(C) 2014 Dg Nechtan <dnechtan@gmail.com> (http://nechtan.github.io)
 */

var _ = require('underscore');
var util = require('util');
var debug = require('debug')('kpax-client');

exports = module.exports = function (opts) {

  var pkg = require('./package.json');

  var options = _.extend({
    url: 'http://localhost'
  }, typeof opts === 'string' ? {
    url: opts
  } : opts || {});

  debug('connecting', options.url);

  var socket = require('socket.io-client').connect(options.url);

  socket.on('connect', function () {
    debug('connected');
    socket.on('event', function (data, b) {
      debug('event', data, b);
    });
    socket.on('disconnect', function () {
      debug('disconnect');
    });
  });

  var cache = require('redis').createClient();

  var _fn = {}, verbs = {}, self = this;

  var newHash = function newHash(prefix) {
    return '_'.concat(prefix || '',
      new Date() * (pkg.version + Math.random()).replace(/\D/g, ''),
      Math.random().toString(36));
  };

  var $emit = function $emit(method, key, params, callback, emitOptions) {
    if (typeof params === 'function') {
      if (typeof callback === 'object' && !emitOptions) {
        emitOptions = callback
      }
      callback = params
    }
    emitOptions = _.extend({
      cache: true
    }, emitOptions || {});
    var cached = false;
    var hash = newHash(key);
    var _emit = function () {
      var args = {
        _hash: hash,
        _key: method + ':' + key,
        _cache: [emitOptions.cache, cacheKey],
        params: params || {}
      };
      _fn[hash] = callback;
      socket.emit('kpax', args);
      debug('emit', args);
      return hash;
    }
    if (emitOptions.cache) {
      var cacheKey = JSON.stringify([method, key, params]);
      cache.get(cacheKey, function (err, data) {
        if (!err && data) {
          try {
            data = JSON.parse(data);
            if (data._hash) {
              return callback(data.data);
            }
          } catch (err) {
            /* Invalid JSON data */
            _emit();
          }
        } else {
          /* Not cached */
          _emit();
        }
      });
    } else {
      return _emit()
    }

  };

  socket.on('kpax', function (data) {
    debug('on kpax data', data);
    if (_fn.hasOwnProperty(data._key) && typeof _fn[data._key] === 'function') {
      debug('$on _key', data._key);
      _fn[data._key].call(kpax, data, {
        send: function(params, data) {
          socket.emit('kpax', {
            _hash: data._hash,
            _key: data._key,
            data: data
          });
        }
      });
      return true;
    }
    if (_fn.hasOwnProperty(data._hash) && typeof _fn[data._hash] === 'function') {
      debug('$on _hash', data._hash);
      if (util.isArray(data._cache) && data._cache[0]) {
        cache.set(data._cache[1], data);
        if (typeof data._cache[0] === 'number' && data._cache[0] > 0) {
          cache.expire(data._cache[1], data._cache[0]);
        }
      }
      _fn[data._hash].call(kpax, data.data);
      return (_fn[data._hash] = null) === null;
    }
  });

  var $on = function $on(type, key, callback) {
    _fn[type + ':' + key] = callback;
  };

  ['get', 'post', 'delete', 'del', 'put', 'head'].map(function (verb) {
    verbs[verb] = $emit.bind(self, verb);
  });

  verbs.on = $on.bind(socket);
  verbs.emit = verbs.send = $emit.bind(socket);
  verbs.socket = socket;
  verbs.cache = cache;
  verbs.identify = function kpaxIdentify(id) {
    socket.emit('kpax:identify', id);
    return verbs;
  };
  return verbs;

}
