var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', {
    title: 'Example with Express 4.x.x + Angular'
  });
});

module.exports = router;
