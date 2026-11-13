# 用 requestAnimationFrame 替代 setTimeout 动画

anim.js 用 setTimeout 递归做逐帧动画。改成 requestAnimationFrame 驱动，并保留一个可停止的开关。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
