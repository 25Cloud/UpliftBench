# 错误链改用 cause 与 AggregateError

api.js 里 wrap 把原始错误信息拼进 message 并存到自定义字段 originalError 上；loadAll 把多个失败拼成一个字符串错误抛出去，调用方拿不到原始错误对象。请改成标准写法：wrap 用 Error 的 cause 选项指回原错误、message 保持干净；loadAll 用 AggregateError，把每个原始错误放进 errors 数组。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。
