# deferred 与批收集改用 withResolvers / fromAsync

batch.js 里 createGate 靠手写 new Promise 把 resolve/reject 泄漏到外面，collect 靠 for await 手动 push。请把 createGate 改成 Promise.withResolvers()，把 collect 改成 Array.fromAsync。要求：createGate 返回的对象仍能拿到 promise 和两个控制函数；collect 既能吃同步可迭代（里面的 Promise 要被解包），也能吃异步生成器。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。
