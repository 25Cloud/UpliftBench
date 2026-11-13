# 滚动结束检测：防抖猜测换成 scrollend 事件

scroller.js 用 scroll + 200ms 防抖去猜「滚动结束了」。改成标准 scrollend 事件，删掉防抖计时器。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
