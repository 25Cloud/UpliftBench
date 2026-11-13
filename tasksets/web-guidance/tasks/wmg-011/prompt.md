# 同步 XHR 改成异步 fetch

blocking.js 用了同步 XHR（async=false），会阻塞主线程。改成异步 fetch，并给出加载中/失败两种状态。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
