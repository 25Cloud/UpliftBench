# escape / unescape 换成 encodeURIComponent

url.js 用了已废弃的 escape()。换成 encodeURIComponent / decodeURIComponent。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
