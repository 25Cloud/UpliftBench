# 时间处理：getYear 与字符串日期解析换成 Intl + Date.parse

time.js 用已废弃的 getYear()，并用 new Date(string) 解析用户输入（实现相关、各浏览器不一致）。改成 Intl.DateTimeFormat 做展示、Date.parse 做解析，非法输入返回 NaN 而不是抛错。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
