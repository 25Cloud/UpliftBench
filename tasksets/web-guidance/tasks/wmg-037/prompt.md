# 滚动监听：非 passive 回调 + setInterval 换成 rAF

scroll.js 在 scroll 回调里用 setInterval 反复触发（会堆积定时器），而且监听没标 passive。改成 { passive: true } 的监听 + requestAnimationFrame 节流，保证同一帧只回调一次。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
