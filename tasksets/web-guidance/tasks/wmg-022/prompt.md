# eval 换成 JSON.parse

parse.js 用 eval 解析 JSON 字符串（危险）。换成 JSON.parse，并加上解析失败分支。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
