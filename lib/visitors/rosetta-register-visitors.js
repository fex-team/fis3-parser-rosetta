var Syntax = require('esprima-fb').Syntax;
var utils = require('jstransform/src/utils');
var rDash = /\-(\w)/g;
var rBracket = /^{(.*)}$/;

function visitRosettaRegister(traverse, object, path, state) {
  var options = state.g.opts;
  var element = options.element;
  var obj = object.arguments[0];

  utils.catchup(obj.range[1] - 1, state);

  var hasIs = false;
  obj.properties.every(function(prop) {
    if (prop.key.name === 'is') {
      hasIs = true;
      return false;
    }
    return true;
  });

  if (obj.properties.length) {
    utils.append(',\n', state);
  }

  if (!hasIs) {
    utils.append('is: \'' + options.name + '\'', state);
    utils.append(',\n', state);
  }

  utils.append('__t: ' + options.tmpl.replace(/;\s*$/, ''), state);
  utils.append(',\n', state);

  utils.append('__rid: \'' + options.moduleId + '\'', state);
};

visitRosettaRegister.test = function(object, path, state) {
  return object.type === Syntax.CallExpression &&
    object.callee.type === Syntax.Identifier &&
    object.callee.name === 'Rosetta' &&
    object.arguments.length === 1 &&
    object.arguments[0].type === Syntax.ObjectExpression
}

exports.visitorList = [
  visitRosettaRegister
];
