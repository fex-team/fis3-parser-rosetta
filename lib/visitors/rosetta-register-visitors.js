var Syntax = require('esprima-fb').Syntax;
var utils = require('jstransform/src/utils');

function visitRosettaRegister(traverse, object, path, state) {
  var options = state.g.opts;
  var fnObject = object.arguments[1];

  utils.catchup(fnObject.body.range[0] + 1, state);
  utils.append('\narguments[0].__t = ' + options.tmpl, state);
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
