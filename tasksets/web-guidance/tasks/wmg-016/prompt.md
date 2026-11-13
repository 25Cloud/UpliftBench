# getYear 换成 getFullYear

date.js 用了已废弃的 getYear。换成 getFullYear，并把年份补成四位。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
