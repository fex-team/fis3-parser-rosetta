var Syntax = require('esprima-fb').Syntax;
var utils = require('jstransform/src/utils');
var rDash = /\-(\w)/g;
var rBracket = /^{(.*)}$/;

function visitRosettaRegister(traverse, object, path, state) {
  var options = state.g.opts;
  var element = options.element;
  var fnObject = object.arguments[1];

  utils.catchup(fnObject.body.range[0] + 1, state);
  utils.append('\nvar __m = arguments[0];', state);
  options.tmpl && utils.append('\n__m.__t = ' + options.tmpl, state);

  var attrs = element.attr();
  var events = {};

  Object.keys(attrs).forEach(function(key) {
    var val = attrs[key];
    key = key.replace(rDash, function(all, letter) {
      return letter.toUpperCase();
    });

    if (key.substring(0, 2) === 'on') {
      events[key.substring(2, 3).toLowerCase() + key.substring(3)] = val;
    }
  });

  var eventTypes = Object.keys(events);
  if (eventTypes.length) {
    utils.catchup(fnObject.body.range[1] - 1, state);

    eventTypes.forEach(function(type) {
      var val = events[type];

      if (rBracket.test(val)) {
        val = RegExp.$1;
      } else {
        val = '\'' + val.replace(/'/g, '\\\'') + '\'';
      }

      utils.append('\n__m.on(\''+type+'\', ' + val + ');', state);
    });
  }
};

visitRosettaRegister.test = function(object, path, state) {
  return object.type === Syntax.CallExpression &&
    object.callee.type === Syntax.MemberExpression &&
    object.callee.object.name === 'Rosetta' &&
    object.callee.property.name === 'register' &&
    object.arguments[0].type === Syntax.Literal &&
    object.arguments[1].type === Syntax.FunctionExpression
}

exports.visitorList = [
  visitRosettaRegister
];
