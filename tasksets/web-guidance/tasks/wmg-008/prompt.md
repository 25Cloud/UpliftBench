# document.all 换成标准查询

legacy.js 用了非标准的 document.all。换成 querySelector / getElementById。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
