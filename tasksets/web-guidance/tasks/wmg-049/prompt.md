# 超时与取消要同时生效（AbortSignal.any + Timeout）

net.js 里 getJson 同时支持「调用方传进来的 signal」和「自己的超时」，但现在的实现是二选一——只要调用方给了 signal，超时就彻底失效，慢接口会一直挂着。请用 AbortSignal.any 合并两个信号、用 AbortSignal.timeout 造超时信号，让两条取消路径都生效。别再用 setTimeout 手动 abort，也不许再出现 clearTimeout。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。
