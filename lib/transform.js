var cheerio = require('cheerio');
var jstransform = require('jstransform');
var RosettaJsXVisitor = require('./visitors/rosetta-jsx-visitors.js');
var RegisterVisitor = require('./visitors/rosetta-register-visitors.js');
var shimShadowStyles = require('./css.js').shimShadowStyles;
var rXlang = /^text\/x\-(.*?)$/g;
var rLink = /<!--(?!\[)([\s\S]*?)(?:-->|$)|(<link[^>]*(?:\/)?>)/ig;
var rImport = /rel=('|")import\1/ig;
var rHref = /href=('|")(.*?)\1/ig;


function transform(content, file, options) {

  // 避免重复处理！
  if (file.isFromRosetta) {
    return content;
  }

  // 因为会把它转成 js, 会丧尸 html 能力。先走一遍 html 编译。
  content = fis.compile.partial(content, file, {
    ext: file.ext,
    isFromRosetta: true
  });


  // 把 template 包裹的内容当原始内容处理。
  content = content.replace(/(<template[^>]*>)(?!<\!\[cdata\[)([\s\S]*?)(<\/template>)/ig, function(_, start, body, end) {
    return start + '<![CDATA[\n' + body + '\n]]>' + end;
  });

  var $ = cheerio.load(content, {
    xmlMode: true
  });

  var element = $('element');

  // custom element 注册
  if (element.length) {
    if (element.length > 1) {
      throw new Error('One single custom element is allowed here.');
    } else if (element.parent().length) {
      throw new Error('Please keep `element` tag in the root.');
    } else if (!element.attr('name')) {
      throw new Error('Please naming the `element`.')
    } else {

      var inlineScripts = [];
      element.children().each(function() {
        if (!~['link', 'style', 'template', 'script'].indexOf(this.name)) {
          throw new Error('Only following tags are allowed under `element` tag: `link`, `style`, `template`, `script`')
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

      return transformElement($, file, options);
    }
  } else {
    return transformHTML($, file, options);
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

    if (/\bRosetta\.register\s*\(\s*('|")(.*?)\1/i.test(content) && RegExp.$2 === name) {
      found = item;
      item.remove();
      return false;
    }

    return true;
  });

  if (!found) {
    throw new Error('Can\'t find `Rosetta.register(\'' + name + '\', function() {});` definition.')
  }

  return found;
}

function transformElement($, file, options) {
  var element = $('element');
  var template = $('template');
  var tmpl = template.length ? template.text().trim() : '';
  var style = findShadowStyle(element, file);
  var f, content, type, ext, styleId;

  if (style) {
    content = shimShadowStyles(style.text(), element.attr('name'));
    type = style.attr('type');
    ext = '.css';
    if (type && rXlang.test(type)) {
      ext = '.' + RegExp.$1;
    }
    f = fis.file.wrap(file.realpathNoExt + ext);
    f.setContent(content);
    fis.compile.process(f);
    file.derived.push(f);
    styleId = f.getId();
  }

  var script = findElementScript(element, file);

  f = fis.file.wrap(file.realpathNoExt + '.js');
  f.setContent((content = script.text()));

  tmpl && (tmpl = transformTemplate(tmpl, element, file));

  content = transformScript(content, tmpl, element);
  f.setContent(content);
  f.useCache = false;

  styleId && f.addRequire(styleId);
  fis.compile.process(f);
  file.derived.push(f);
  file.release = false;

  $('link[rel=stylesheet][href], script[src]').each(function() {
    var filepath = this.attribs[this.name === 'link' ? 'href' : 'src'];
    var info = fis.project.lookup(filepath, file);

    $(this).remove();
    file.addRequire(info.id);
  });


  // 复制依赖给 js, 因为 html 已经不产出了。
  file.requires.forEach(function(id) {
    f.addRequire(id);
  });

  file.asyncs.forEach(function(id) {
    f.addAsyncRequire(id);
  });

  return '';// $.html();
}

var index = 0;

function transformHTML($, file) {
  $('link[rel=import][href]').each(function() {
    var info = fis.project.lookup(this.attribs.href, file);
    if (info.file) {
      file.addRequire(info.id.replace(/\.(.*?)$/, '.js'));
    }
    $(this).remove();
  });

  $('*').each(function() {
    if (!~this.name.indexOf('-')) {
      return;
    }

    // todo 当开启 optimizer 的时候，才压缩代码。
    // if (file.optimizer) {

    // }

    var transformed = jstransform.transform(RosettaJsXVisitor.visitorList, $.html(this), {
      alias: {
        'Rosetta.create': 'c'
      }
    });
    fn = transformed.code;

    $(this).replaceWith('<textarea type="r-element" id="rs-' + (++index) + '"><![CDATA[\n(function(r, c){r(' + fn + ', "#rs-' + index + '");})(Rosetta.render, Rosetta.create);\n]]></textarea>');
  });

  return $.html();
}

function transformTemplate(content, element, file) {

  content = content.replace(rLink, function(all, comment, link) {
    if (comment) {
      return '';
    }

    if (rLink.test(link) && rHref.test(link)) {
      var href = RegExp.$2;
      var info = fis.project.lookup(href, file);

      if (info.file) {
        file.addRequire(info.id.replace(/\.(.*?)$/, '.js'));
      }
      all = '';
    }

    return all;
  }).trim();


  var fn = 'function tmpl(tag, attrs, refers) { return (<div class={tag.type}>' + content + '</div>);};';
  var transformed = jstransform.transform(RosettaJsXVisitor.visitorList, fn);
  fn = transformed.code;
  return fn;
}

function transformScript(content, tmpl, element) {
  var transformed = jstransform.transform(RegisterVisitor.visitorList, content, {
    tmpl: tmpl,
    element: element
  });

  return transformed.code;
}


// expose.
module.exports = transform;
transform.element = transformElement;
transform.html = transformHTML;
