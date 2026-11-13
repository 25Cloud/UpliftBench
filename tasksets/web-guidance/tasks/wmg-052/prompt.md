# 深拷贝丢了 Date/Map/Set，集合运算改用手法

state.js 里 cloneState 用 JSON 往返做深拷贝——Date 变字符串、Map 变空对象、Set 变空对象，这是真 bug。请改成 structuredClone。另外 merged/shared/onlyA 现在是手工展开 + filter，请改成 Set 自带的 union / intersection / difference。四个函数都不许改动入参，返回值类型保持不变（三个集合函数返回 Set）。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。
