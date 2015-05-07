var transform = require('./lib/transform.js');

module.exports = function(content, file, opt) {

  try {
    content = transform(content, file, opt);
  } catch (e) {
    fis.log.warn(e.message + 'while parsing `%s`.', file.subpath);
    fis.log.debug(e.stack);
  }

  return content;
};

module.exports.defaultOptions = {
  compileUseage: false
};
