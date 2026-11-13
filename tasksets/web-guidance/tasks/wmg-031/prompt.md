# 三文件综合迁移：网络 + DOM + 语法

三个文件各有一处历史包袱：api.js 用 XMLHttpRequest、ui.js 用 innerHTML 拼接、index.html 用 onclick 内联、util.js 用 var 和 substr。全部改掉：网络用 fetch + await，DOM 用 textContent 与 addEventListener，变量用 const/let，截断用 slice。输出结构与导出名保持不变。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
