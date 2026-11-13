# getElementsByClassName 换成 querySelectorAll

query.js 用 getElementsByClassName 并遍历 HTMLCollection。换成 querySelectorAll + forEach。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
