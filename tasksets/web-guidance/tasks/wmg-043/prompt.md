# 时长格式化：手写拼接换成 Intl.DurationFormat

duration.js 手写「X 小时 Y 分」的拼接，且写死中文单位，无法本地化。改成 Intl.DurationFormat：传入 { hours, minutes, seconds } 对象，用 style: "long" 输出本地化文案。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
