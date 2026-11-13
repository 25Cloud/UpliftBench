# 任务调度：setTimeout(0) 换成 scheduler.postTask / yield

sched.js 用 setTimeout(fn, 0) 把工作推到下一个宏任务，并且用「是否超过 50ms」手工判断要不要让步。改成调度器 API：用 scheduler.postTask 派发任务（带 priority），长循环里用 scheduler.yield() 定期让出主线程。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
