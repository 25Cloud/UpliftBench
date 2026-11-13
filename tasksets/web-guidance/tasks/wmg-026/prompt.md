# 回调地狱改成 async/await

order.js 三层回调嵌套下单。改成 async/await，并给网络调用加 AbortController 超时。行为保持：任一步失败要能回滚提示。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
