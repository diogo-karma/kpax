/*!
 * kpax v0.0.3 node-client
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

  var iVerbs = ['get', 'head'];
  var oVerbs = ['post', 'delete', 'del', 'put'];
  var verbs = iVerbs.concat(oVerbs);

  debug('connecting', options.url);

  var socket = require('socket.io-client').connect(options.url);

  socket.on('connect', function () {
    debug('connected');
    client.identify();
    socket.on('event', function (data, b) {
      debug('event', data, b);
    });
    socket.on('disconnect', function () {
      debug('disconnect');
    });
    debug('connect', _.isFunction(_fn['connect']));
    if (_.isFunction(_fn['connect'])) {
      _fn['connect'].call(client);
    }
  });

  var cache = require('redis').createClient();

  var _fn = {}, client = {}, self = this;

  var newHash = function newHash(prefix) {
    return '_'.concat(prefix || '',
      new Date() * (pkg.version + Math.random()).replace(/\D/g, ''),
      Math.random().toString(36));
  };

  var $emit = function $emit(options, callback) {
    debug('new $emit', options);
    options = _.extend({
      cache: !~oVerbs.indexOf(options.method || 'get'),
      method: 'get',
      url: '',
      params: {},
      data: {}
    }, options || {});
    var cached = false;
    var cacheKey = JSON.stringify([options.method, options.url, options.params]);
    var hash = newHash(options.url);
    var _emit = function () {
      var args = {
        _hash: hash,
        _key: options.method + ':' + options.url,
        _cache: [options.cache, cacheKey],
        params: options.params,
        data: options.data
      };
      if (options.hasOwnProperty('to')) {
        args.to = options.to;
      }
      _fn[hash] = callback;
      socket.emit('kpax', args);
      debug('emit', args);
      return client;
    }
    if (options.cache) {
      cache.get(cacheKey, function (err, data) {
        if (!err && data) {
          try {
            data = JSON.parse(data);
            if (data._hash) {
              callback(data.data);
              return client;
            }
          } catch (err) {
            /* Invalid JSON data */
            return _emit.call(client);
          }
        } else {
          /* Not cached */
          return _emit.call(client);
        }
      });
    } else {
      return _emit.call(client);
    }

  };

  socket.on('kpax', function (data) {
    debug('on kpax data', data);
    if (_fn.hasOwnProperty(data._key) && typeof _fn[data._key] === 'function') {
      debug('$on _key', data._key);
      _fn[data._key].call(client, data, {
        send: function (ndata) {
          socket.emit('kpax', {
            _hash: data._hash,
            _key: data._key,
            data: ndata
          });
        }
      });
      return true;
    }
    if (_fn.hasOwnProperty(data._hash) && _.isFunction(_fn[data._hash])) {
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
    debug('$on', type, !_.isFunction(key) ? key : 'callback');
    if (type === 'connect' && _.isFunction(key)) {
      _fn[type] = key;
      if (socket.socket.connected) {
        callback.call(client, {
          id: socket.id
        });
      }
    } else {
      _fn[type + ':' + key] = callback;
    }
  };

  verbs.map(function (verb) {
    client[verb] = function (options, callback) {
      debug('client[verb]', verb, options)
      var opt = _.extend({
        method: verb,
        url: '',
        params: '',
        cache: !~oVerbs.indexOf(verb)
      }, options || {}, {
        method: verb
      });
      if (!_.isFunction(callback)) {
        callback = function () {};
      }
      $emit.call(client, opt, callback);
    }
  });

  client.on = $on.bind(client);
  client.emit = client.send = $emit.bind(client);
  client.socket = socket;
  client.cache = cache;
  client.identify = function kpaxIdentify(id) {
    if (!id) {
      if (options.hasOwnProperty('identify')) {
        id = options.identify;
      } else {
        return client;
      }
    } else {
      options.identify = id;
    }
    socket.emit('kpax:identify', id);
    return client;
  };
  return client;

}
