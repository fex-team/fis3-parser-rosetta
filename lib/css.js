function shimShadowStyles(content, elementName) {

  return content.replace(/\:host\b/ig, '.'+elementName);
}

exports.shimShadowStyles = shimShadowStyles;
