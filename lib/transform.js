var cheerio = require('cheerio');
var jstransform = require('jstransform');
var esprima = require('esprima-fb');
var escodegen = require('escodegen');
var RosettaJsXVisitor = require('./visitors/rosetta-jsx-visitors.js');
var RegisterVisitor = require('./visitors/rosetta-register-visitors.js');
var shimShadowStyles = require('./css.js').shimShadowStyles;
var rElement = /<element[^>]*>[\s\S]*<\/element>/i;
var rXlang = /^text\/x\-(.*?)$/g;
var rLink = /<!--(?!\[)([\s\S]*?)(?:-->|$)|(<link[^>]*(?:\/)?>)/ig;
var rImport = /rel=('|")import\1/i;
var rHref = /href=('|")(.*?)\1/i;
var rClass = /class=('|")(.*?)\1/i;
var rRElment = /(<(\w+\-\w+)[^>]*>)([\s\S]*?)(<\/\2>)/ig;


function transform(content, file, options) {
  // element define
  if (rElement.test(content)) {
    // 把 template 包裹的内容当原始内容处理。
    content = content.replace(/(<template[^>]*>)(?!<\!\[cdata\[)([\s\S]*?)(<\/template>)/ig, function(_, start, body, end) {
      return start + '<![CDATA[\n' + body + '\n]]>' + end;
    });

    var $ = cheerio.load(content, {
      recognizeCDATA: true
    });
    var element = $('element');

    if (element.length > 1) {
      throw new Error('One single custom element is allowed here.');
    } else if (element.parent().length) {
      throw new Error('Please keep `element` tag in the root node.');
    } else if (!element.attr('name')) {
      throw new Error('Please set the value of `name` attribute of the `element`.')
    } else {

      var inlineScripts = [];
      element.children().each(function() {
        if (!~['link', 'style', 'template', 'script'].indexOf(this.name)) {
          throw new Error('Only following tags are allowed under the `element` tag: `link`, `style`, `template`, `script`')
        } else if (this.name === 'script' && !this.attribs.src) {
          inlineScripts.push(this);
        }
        return true;
      });

      if (!inlineScripts.length) {
        throw new Error('In-line `script` tag is mandatory for an custom element.');
      } else if (inlineScripts.length > 1) {
        throw new Error('Only single In-line `script` tag is allowed.');
      }

      content = transformElement($, file, options);
    }
  } else {
    content = transformHTML(content, file, options);
  }

  return content;
}


function findShadowStyle(element, file) {
  var style = element.children('style');

  if (style.length > 1) {
    throw new Error('Only single `style` tag is allowed under `element` tag.')
  }

  return style.length ? style : null;
}

function findElementScript(element, file) {
  var found = null;
  var name = element.attr('name');

  element.children('script:not([src])').get().reverse().every(function(item) {
    item = cheerio(item);
    var content = item.text();

    if (/\bRosetta\s*\(\s*{/i.test(content)) {
      found = item;
      item.remove();
      return false;
    }

    return true;
  });

  if (!found) {
    throw new Error('Can\'t find `Rosetta({...})` definition.')
  }

  return found;
}

function transformElement($, file, options) {
  var element = $('element');
  var template = $('template');
  var tmpl = template.length ? template.text().trim() : '';
  var style = findShadowStyle(element, file);
  var f, content, type, ext;

  file.rosetta = element.attr('name');

  if (style) {
    content = shimShadowStyles(style ? style.text() : '', element.attr('name'));
    type = style && style.attr('type');
    ext = '.css';
    if (type && rXlang.test(type)) {
      ext = '.' + RegExp.$1;
    }
    f = fis.file.wrap(file.realpathNoExt + ext);
    f.cache = file.cache;
    f.setContent(content);
    fis.compile.process(f);
    f.links.forEach(function(derived) {
      file.addLink(derived);
    });
    file.derived.push(f);
    file.addRequire(f.getId());
  }

  var script = findElementScript(element, file);
  content = script.text().trim();

  tmpl && (tmpl = transformTemplate(tmpl, element, file));

  content = transformScript(content, tmpl, element, file);

  $('link[rel=stylesheet][href], script[src]').each(function() {
    var filepath = this.attribs[this.name === 'link' ? 'href' : 'src'];
    var info = fis.project.lookup(filepath, file);

    $(this).remove();
    file.addRequire(info.id);
    if (info.file) {
      file.addLink(info.file.subpath);
    }
  });

  return content;
}

function transformHTML(content, file, options) {
  content = content.replace(rLink, function(all, comment, link) {
    if (comment) {
      return all;
    }

    if (rImport.test(link) && rHref.test(link)) {
      var href = RegExp.$2;
      var info = fis.project.lookup(href, file);

      if (info.file) {
        file.addRequire(info.id);
        file.addLink(info.file.subpath);
      }
      all = '';
    }

    return all;
  });

  var index = 0;
  var hash = fis.util.md5(file.subpath);

  if (options.compileUsage) {
    content = content.replace(rRElment, function(all, start, tag, body, end) {
      var opts = {
        alias: {
          'Rosetta.create': 'create'
        }
      };

      var transformed = jstransform.transform(RosettaJsXVisitor.visitorList, all, opts);
      var fn = transformed.code;

      index++;
      fn = '(function(render, create) {\n    render(' + fn + ', "#rs-' + hash + '-' + index + '");\n})(Rosetta.render, Rosetta.create);';

      // 走一遍  fis 内核编译。
      fn = fis.compile.partial(fn, file, {
        ext: '.js',
        isJsLike: true
      });

      return '<input type="hidden" id="rs-' + hash + '-' + index + '" />\n<script type="text/rosetta">\n' + fn + '\n</script>';
    });
  } else {

    content = content.replace(/(<(\w+\-\w+)[^>]*>)/ig, function(all, start, tag) {
      if (rClass.test(start)) {
        start = start.replace(rClass, function(all, quote, orgin) {
          return 'class=' + quote + (~orgin.indexOf('r-element') ? '' : 'r-element ') + (~orgin.indexOf('r-invisible') ? '' : 'r-invisible ') + orgin + quote;
        });
      } else {
        start = start.replace(/<(\w+\-\w+)([^>]*)>/, function(all, tag, params) {
          return '<' + tag + params + ' class="r-element r-invisible">';
        });
      }

      return start;
    });
  }



  return content;
}

function transformTemplate(content, element, file) {

  content = content.replace(rLink, function(all, comment, link) {
    if (comment) {
      return '';
    }

    if (rImport.test(link) && rHref.test(link)) {
      var href = RegExp.$2;
      var info = fis.project.lookup(href, file);

      if (info.file) {
        file.addRequire(info.id);
        file.addLink(info.file.subpath);
      }
      all = '';
    }

    return all;
  }).trim();

  // template 部分为 html，在转成 js 前，先走一遍 html 编译
  content = fis.compile.partial(content, file, {
    ext: '.part',
    isHtmlLike: true
  });

  var fn = 'function tmpl(tag, refs) { with(tag) { return (<div class={tag.type}>' + content + '</div>);}};';
  try {
    var transformed = jstransform.transform(RosettaJsXVisitor.visitorList, fn, {
      alias: {
        'Rosetta.create': 'tag.create'
      }
    });
  } catch(e) {

    // format
    var lines = fn.split(/\r\n|\n|\r/).map(function(line, index) {
      var lineNumber = ((index+1)/1000).toFixed(3).substring(2);

      if (index === e.lineNumber - 1) {
        lineNumber = lineNumber.red;
      }

      return lineNumber + ': ' +  line;
    });

    lines.splice(e.lineNumber, 0, fis.util.pad(' ', e.column + 4) + '^'.red);
    lines = lines.slice(Math.max(0, e.lineNumber - 5), e.lineNumber + 5);

    e.message = e.description;
    e.detail = '\n\n' + lines.join('\n') + '\n';

    throw e;
  }
  fn = transformed.code;
  return fn;
}

function transformScript(content, tmpl, element, file) {
  var transformed = jstransform.transform(RegisterVisitor.visitorList, content, {
    tmpl: tmpl,
    element: element,
    name: element.attr('name'),
    moduleId: file.moduleId || file.id
  });
  var content = transformed.code;

  if (!file.optimizer) {
    content = reIndent(content);
  }

  return content;
}

function reIndent(code) {
  var ast = esprima.parse(code);
  return escodegen.generate(ast);
}


// expose.
module.exports = transform;
transform.element = transformElement;
transform.html = transformHTML;
