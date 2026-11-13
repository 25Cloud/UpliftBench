# alert 换成可控的提示

notify.js 用 alert 做提示。改成一个可注入的提示函数（默认 console.log），不要再用 alert。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
