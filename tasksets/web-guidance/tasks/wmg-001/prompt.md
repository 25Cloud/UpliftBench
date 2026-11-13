# 用 fetch 替代 XMLHttpRequest

app.js 里用 XMLHttpRequest 拉取 /api/users。请把它改成 fetch + async/await 写法，保持响应仍是 JSON 数组，并把错误用 console.error 打印。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
