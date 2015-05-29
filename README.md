Rosetta Parser tools
================================

For more information, please visit [here](https://github.com/jiexuangao/rosetta/wiki).

## 安装

支持全局安装和局部安装，根据自己的需求来定。

```
npm install fis3-parser-rosetta
```

## 使用

将 custom element 格式的 html 文件，解析成 js 文件。

```javascirpt
fis.match('/elements/*.html', {
  rExt: '.js',
  parser: fis.plugin('rosetta')
}):
```

## 配置说明

* `compileUsage` 默认为 false，配置是否将调用 element 的部分，解析成 js.
