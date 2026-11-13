# new Array 换成数组字面量

alloc.js 用 new Array() 与 Array(n) 的怪异语义。换成数组字面量与 Array.from。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
