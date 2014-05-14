/*!
 * angular-kpax v0.0.5
 * Copyright(C) 2014 Dg Nechtan <dnechtan@gmail.com> (http://nechtan.github.io)
 */

angular.module('ngSocketIO', [])
  .provider('ioFactory', function () {
    'use strict';

    var defaultPrefix = 'socket:';
    var ioSocket = null;

    this.$get = ['$rootScope', '$timeout',
      function ($rootScope, $timeout) {

        var asyncAngularify = function (socket, callback) {
          return callback ? function () {
            var args = arguments;
            $timeout(function () {
              callback.apply(socket, args);
            }, 0);
          } : angular.noop;
        };

        return function ioFactory(options) {

          options = options || {};

          var socket = options.ioSocket || io.connect();
          var prefix = options.prefix || defaultPrefix;
          var defaultScope = options.scope || $rootScope;

          socket.on('error', function (reason) {
            if (/handshake/.test(reason)) {
              console.log('handshake error');
              socket.disconnect();
              if (options.failureRedirect) {
                window.location.href = options.failureRedirect;
              }
            }
          });

          var addListener = function (eventName, callback) {
            socket.on(eventName, asyncAngularify(socket, callback));
          };

          var wrappedSocket = {
            on: addListener,
            addListener: addListener,
            emit: function (eventName, data, callback) {
              return socket.emit(eventName, data, asyncAngularify(socket, callback));
            },
            removeListener: function () {
              return socket.removeListener.apply(socket, arguments);
            },
            forward: function (events, scope) {
              if (events instanceof Array === false) {
                events = [events];
              }
              if (!scope) {
                scope = defaultScope;
              }
              events.forEach(function (eventName) {
                var prefixedEvent = prefix + eventName;
                var forwardBroadcast = asyncAngularify(socket, function (data) {
                  scope.$broadcast(prefixedEvent, data);
                });
                scope.$on('$destroy', function () {
                  socket.removeListener(eventName, forwardBroadcast);
                });
                socket.on(eventName, forwardBroadcast);
              });
            }
          };

          return wrappedSocket;
        };
    }];

  });

angular.module('ngKpax', ['ngSocketIO'])
  .constant('KPAX_SCHEMA', 'kpax:')
  .constant('KPAX_VERSION', '0.0.1')
  .factory('kpax', ['ioFactory', 'KPAX_SCHEMA', 'KPAX_VERSION', '$cacheFactory', '$timeout',
    function (ioFactory, KPAX_SCHEMA, KPAX_VERSION, $cacheFactory, $timeout) {
      'use strict';

      var socket = ioFactory({
        failureRedirect: '/login'
      });

      var cache = $cacheFactory('kpax');

      var _fn = {}, client = {}, self = this;

      var iVerbs = ['get', 'head'];
      var oVerbs = ['post', 'delete', 'del', 'put'];
      var verbs = iVerbs.concat(oVerbs);

      var newHash = function newHash(prefix) {
        return '_'.concat(prefix || '',
          new Date() * (KPAX_VERSION + Math.random()).replace(/\D/g, ''),
          Math.random().toString(36));
      };

      var $emit = function $emit(options, callback) {
        if (angular.isFunction(callback)) callback = [callback];
        if (!callback) callback = [];
        options = angular.extend({
          cache: !~oVerbs.indexOf(options.method || 'get'),
          method: 'get',
          url: '',
          params: {},
          data: {},
        }, options || {});
        var cached = false;
        var hash = newHash(options.method + ':' + options.url);
        if (options.cache) {
          var cacheKey = JSON.stringify([options.method, options.url, options.params]);
          if (cached = cache.get(cacheKey)) {
            for (var x = 0; x < callback.length; x++) {
              callback[x](cached.data);
            }
            return cached._hash;
          }
        }
        if (angular.isFunction(options.success)) {
          callback.push(options.success);
        }
        _fn[hash] = callback;
        socket.emit('kpax', {
          _hash: hash,
          _key: options.method + ':' + options.url,
          _cache: [options.cache, cacheKey],
          to: options.hasOwnProperty('to') ? options.to : null,
          params: options.params
        });
        return hash;
      };

      var $on = function $on(verb, key, callback) {
        // Object jQuery-Ajax-Style
        if (angular.isFunction(callback)) callback = [callback];
        if (!callback) callback = [];

        if (angular.isObject(verb)) {
          var opt = verb;
          if (angular.isFunction(key)) {
            callback.push(key);
            key = '';
          } else {
            if (angular.isArray(key)) {
              callback = callback.concat(key);
              key = '';
            }
            if (opt.hasOwnProperty('success')) {
              callback.push(opt.success);
            }
            if (opt.hasOwnProperty('complete')) {
              callback.push(opt.success);
            }
          }
          if (opt.hasOwnProperty('type')) {
            verb = opt.type;
          }
          if (opt.hasOwnProperty('method')) {
            verb = opt.method;
          }
          if (opt.hasOwnProperty('url')) {
            key = opt.url;
          }
        }
        var _key = verb + ':' + key;
        console.log('set $on', _key, callback);
        if (!angular.isArray(_fn[_key])) {
          _fn[_key] = [];
        }
        _fn[_key] = _fn[_key].concat(callback);
      };

      socket.on('kpax', function (data) {
        console.log('on kpax', data);
        if (_fn.hasOwnProperty(data._key)) {
          console.log('$on _key', data._key);
          var _emit = function (ret) {
            socket.emit('kpax', {
              _hash: data._hash,
              _key: data._key,
              data: ret
            });
          };
          if(!_fn[data._key]['length']) _fn[data._key] = [_fn[data._key]];
          for (var x = 0, m = _fn[data._key].length; x < m; x++) {
            if (angular.isFunction(_fn[data._key][x])) {
              _fn[data._key][x].call(socket, data, {
                send: _emit,
                emit: _emit,
                json: _emit
              });
            }
          }
          return true;
        }
        if (_fn.hasOwnProperty(data._hash) && angular.isFunction(_fn[data._hash])) {
          _fn[data._hash] = [_fn[data._hash]];
        }
        if (_fn[data._hash] && _fn[data._hash]['length']) {
          if (angular.isArray(data._cache) && data._cache[0]) {
            cache.put(data._cache[1], data);
            if (angular.isNumber(data._cache[0]) && data._cache[0] > 0) {
              $timeout(function () {
                cache.remove(data._cache[1])
              }, data._cache[0]);
            }
          }
          for (var x = 0; x < _fn[data._hash].length; x++) {
            if (angular.isFunction(_fn[data._hash][x])) {
              _fn[data._hash][x](data.data);
            }
          }
          _fn[data._hash] = null;
        }
      });

      verbs.map(function (verb) {
        client[verb] = function (url, data, params, callback) {
          if (angular.isFunction(callback)) callback = [callback];
          if (!callback) callback = [];
          if (angular.isObject(url)) {
            if (angular.isFunction(url['success'])) {
              callback.push(url.success);
            }
            if (angular.isFunction(url['complete'])) {
              callback.push(url.complete);
            }
            if (angular.isFunction(data)) {
              callback.push(data);
            }
            $emit(url, callback);
          } else {
            if (angular.isFunction(params)) {
              callback.push(params);
              params = {};
            }
            $emit({
              url: url,
              method: verb,
              params: params,
              data: data
            }, callback);
          }
        };
      });

      client.on = $on.bind(socket);
      client.emit = client.send = $emit.bind(socket);
      client.socket = socket;
      client.cache = cache;
      client.identify = function kpaxIdentify(id) {
        socket.emit('kpax:identify', id);
        return client;
      };
      return client;

}]);
