var transform = require('./lib/transform.js');

module.exports = function(content, file, opt) {

  try {
    content = transform(content, file, opt);
  } catch (e) {
    fis.log.warn('Got error: %s while parsing `%s`.', e.message, file.subpath);
    fis.log.debug(e.stack);
  }

  return content;
};

module.exports.defaultOptions = {
  compileUsage: false
};
