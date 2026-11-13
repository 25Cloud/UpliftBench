# showModalDialog 换成 dialog.showModal

dialog.js 用了早已移除的 window.showModalDialog。改成原生 <dialog> 的 showModal()/close()，保留返回值语义（用 Promise 包装）。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
