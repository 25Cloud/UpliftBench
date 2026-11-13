# 分组用 groupBy，排序用 toSorted

report.js 里三个函数都用老写法：两个分组函数用 reduce 手搓累加器，ranked 用 sort 把调用方传进来的数组就地排序（这是个 bug，调用方数组被改了）。请改成 Object.groupBy / Map.groupBy / toSorted。输出要保持原样：byTeam 返回普通对象、byTeamMap 返回 Map、两者的值都是「人名数组」；ranked 返回新的降序数组，且不许改动入参。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。
