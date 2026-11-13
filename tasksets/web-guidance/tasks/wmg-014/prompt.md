# 用 transform 替代 style.left 动画

move.js 靠改 style.left 做动画（触发 layout）。改成 transform: translateX，并保留结束回调。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
