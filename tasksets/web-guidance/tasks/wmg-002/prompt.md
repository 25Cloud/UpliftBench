# 用 DOM API 替代 document.write

render.js 用 document.write 拼出列表。改写成 createElement/appendChild，保留同样的输出结构。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
