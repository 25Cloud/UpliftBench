# attachEvent 换成 addEventListener

legacy-events.js 用了 IE 时代的 attachEvent。改成 addEventListener，事件名去掉 on 前缀。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
