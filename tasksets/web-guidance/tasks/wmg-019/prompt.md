# onreadystatechange 改成 fetch

poll.js 用 XHR 的 onreadystatechange 轮询。改成 fetch + 轮询循环，保留同样的重试语义。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
