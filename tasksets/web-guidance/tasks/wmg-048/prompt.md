# 长列表渲染：全量渲染换成 content-visibility

feed.css 把所有卡片全量渲染，长列表滚动卡顿。改成 content-visibility: auto 配合 contain-intrinsic-size 让浏览器跳过屏外渲染，并保留卡片原有尺寸不跳动。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
