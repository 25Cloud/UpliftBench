# 确认对话框：window.confirm 换成原生 dialog

modal.js 用 window.confirm 做确认、用 setAttribute 塞 tabindex 与 onclick。改成原生 <dialog>：在 index.html 里加 <dialog> 元素，用 showModal()/close()，把提示区标成 aria-live，删掉内联 tabindex 与 onclick。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
