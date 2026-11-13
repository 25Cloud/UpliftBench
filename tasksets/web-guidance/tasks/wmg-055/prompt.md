# URL 校验别再靠 try-catch

links.js 里 safeParse / isLink 都用 try-catch 包 new URL 来判断合法性。请改成静态方法：URL.parse 解析失败返回 null，URL.canParse 返回布尔值。hostOf 要保持「非法输入给空串」。改完文件里不该再出现 try。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
- 评分器会把你的代码真的 import 进来跑一遍边界用例：写法对了但行为错了，一样不给分。
