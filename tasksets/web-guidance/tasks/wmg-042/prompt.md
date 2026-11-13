# URL 匹配：手写正则换成 URLPattern

router.js 用一堆手写正则和字符串拼接解析路由（易错、不可读）。改成标准 URLPattern：用 new URLPattern({ pathname }) 定义路由，pattern.exec(url) 取参数，不要再手写正则。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
