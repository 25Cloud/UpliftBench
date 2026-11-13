# outerHTML 替换子节点换成 replaceChildren

swap.js 用 outerHTML 覆盖整个容器。改成 replaceChildren / append，保持容器本身不被销毁。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
