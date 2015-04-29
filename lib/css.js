function shimShadowStyles(content, elementName) {
  // todo
  return content.replace(/\:host\b/ig, '.'+elementName);
}

exports.shimShadowStyles = shimShadowStyles;
