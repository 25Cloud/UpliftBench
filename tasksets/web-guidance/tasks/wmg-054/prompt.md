# 三个数组函数都在偷改入参

todo.js 里 undoLast 用 reverse 就地翻转、rename 直接给下标赋值、removeAt 用 splice 就地删除——三个函数都把调用方的数组改坏了。请改成非破坏性写法：toReversed / with / toSpliced。要求返回值与原来语义一致，且入参一个字节都不许动。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。
