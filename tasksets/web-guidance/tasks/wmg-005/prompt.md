# innerHTML 拼字符串换成 textContent

list.js 把用户输入直接塞进 innerHTML（有 XSS 风险）。改成先 createElement 再 textContent，结构不变。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
