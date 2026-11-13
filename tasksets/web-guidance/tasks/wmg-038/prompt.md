# 网络：回调式 Promise 链换成 async + 超时 + allSettled

client.js 用 .then(function …) / .catch(function …) 写回调链，且没有超时、一个失败就全挂。改成 async 函数：用 AbortSignal.timeout 控制超时，用 Promise.allSettled 收集结果并区分成功与失败项。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
