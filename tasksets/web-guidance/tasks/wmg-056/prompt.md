# 字素簇、NFC、土耳其语小写

text.js 里三个函数各踩一个坑：graphemes 用展开运算符切字符串，组合符和 ZWJ 表情会被切成好几段；normalize 什么都没做，而它应该输出 NFC；fold 用 toLowerCase，在土耳其语环境里大写 I 的小写是 ı 而不是 i。请分别改成 Intl.Segmenter（granularity 用 grapheme）、normalize('NFC')、toLocaleLowerCase('tr')。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。
