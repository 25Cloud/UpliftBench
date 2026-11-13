# 进入动画：rAF 双帧 hack 换成 @starting-style

reveal.js 用 requestAnimationFrame 跑两帧再加 class 来触发过渡（hack）。改成 CSS 原生能力：用 @starting-style 定义初始状态，用 transition-behavior: allow-discrete 让 display 可过渡，删掉双帧 hack。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
