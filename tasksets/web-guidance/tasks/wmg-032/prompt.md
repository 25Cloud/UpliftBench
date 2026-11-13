# 表单校验：alert + event.returnValue 换成约束校验 API

form.js 用 alert 弹错误、用 event.returnValue 阻止提交（早已废弃）。改成约束校验 API：用 checkValidity() 判断、用 setCustomValidity() 写错误文案、并监听 invalid 事件做统一提示。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
