# substr 换成 slice

text.js 用了已废弃的 substr。换成 slice，注意第二个参数语义不同（终点索引 vs 长度）。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
