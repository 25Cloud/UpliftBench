# execCommand 换成 Clipboard API

clipboard.js 用 document.execCommand("copy")。换成 navigator.clipboard.writeText，并用 await 处理失败。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
