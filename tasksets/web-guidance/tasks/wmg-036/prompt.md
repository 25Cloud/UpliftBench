# 布局：float 与 !important 换成 grid + clamp

layout.css 用 float + clear 做栅格，还用 !important 压边距。改成 display: grid + gap，把间距改成 clamp() 自适应，删掉全部 float / clear / !important。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
