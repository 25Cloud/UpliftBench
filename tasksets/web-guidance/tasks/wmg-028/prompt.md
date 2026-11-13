# unload 事件换成 pagehide

leave.js 监听 unload 保存草稿（在移动端常被丢弃）。换成 pagehide + visibilitychange。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
