# keyCode 换成 key

keys.js 靠 event.keyCode 判断回车。换成 event.key 比较，保留同样的行为。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
