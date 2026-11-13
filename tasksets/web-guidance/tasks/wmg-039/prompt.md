# 模块化：CommonJS 换成 ESM

legacy.js 用 require / module.exports。改成 ESM：import 引入依赖、export 导出，行为不变。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
