# 图片加载：内联 onload + 手动 setAttribute 换成现代加载属性

gallery.js 与 index.html 用内联 onload 和手动 setAttribute 控制图片加载。改成声明式：img 加 loading="lazy" 与 decoding="async"，删掉全部内联 onload。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
