# UA 嗅探换成特性检测

detect.js 靠 navigator.userAgent 判断浏览器能力。改成特性检测（in 运算符 / typeof），不读 UA。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
