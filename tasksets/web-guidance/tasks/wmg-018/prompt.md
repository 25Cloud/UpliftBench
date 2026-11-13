# window.event 换成事件参数

handler.js 依赖非标准的 window.event。改成从处理函数的参数拿事件对象。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
