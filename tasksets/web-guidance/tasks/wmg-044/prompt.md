# 保留状态的 DOM 移动：remove + insert 换成 moveBefore

reorder.js 通过 removeChild + insertBefore 移动节点，导致 iframe/video 重新加载、焦点丢失。改成新 API：用 element.moveBefore(node, ref) 保留节点状态，不要再 removeChild。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
