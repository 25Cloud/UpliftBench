# 移动 DOM 节点不许重载状态（提示词不给 API 名）

reorder.js 用 removeChild + insertBefore 移动节点，副作用是 iframe/video 重新加载、焦点丢失、CSS 过渡被打断。请改成浏览器原生的移动能力：节点在 DOM 里换位置，但它**不算被重新插入**——状态要保留。不要再 removeChild。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
