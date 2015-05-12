function shimShadowStyles(content, elementName) {

  content = 'r-' + elementName + ', .' + elementName + ' {\n  display:none;\n}\n' + content;

  return content.replace(/\:host\b/ig, '.'+elementName);
}

exports.shimShadowStyles = shimShadowStyles;
