# 安全渲染：innerHTML + eval + document.write 全清

render.js 同时用了 innerHTML 拼 HTML、eval 解析配置、document.write 追加节点——三个都是注入面。改成 createElement + textContent 构建 DOM、JSON.parse 解析配置（失败要兜底）、append 追加节点。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
