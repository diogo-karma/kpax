kpax - v0.0.5
====

Ultralight and fastest RESTful for NodeJS/Express/AngularJS

### Instalation:
```bash
$ npm install --save kpax
```

### Example:
```javascript
var express = require('express');
var app = express();
var server = http.createServer(app);
var kpax = require('kpax')(server);

// methods: [get, post, put, head, del]
kpax.get('/something', function(req, res) {
  if(req.params.id) {
    findById(req.params.id, function(err, ret) {
      res.send(ret);
    });
  } else {
    res.send('not found')
  }
});

// or using kpax-prefix on express
app.post('kpax:/something', function(req, res) {});
```

**Copyright (c) 2014 Dg Nechtan**

MIT
