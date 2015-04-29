var transform = require('./lib/transform.js');

module.exports = function(content, file, opt) {

  try {
    content = transform(content, file, opt);
  } catch (e) {
    fis.log.warn(e.message);
    fis.log.debug(e.stack);
  }

  return content;
};
