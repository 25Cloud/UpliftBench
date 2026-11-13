# 自定义下拉：div + class 切换换成 popover

menu.js 用手写 class 切换和 document 点击监听做下拉菜单（层级、点击穿透、Esc 都要自己处理）。改成原生 API：index.html 用 popover 属性 + popovertarget 按钮，脚本用 showPopover()/hidePopover()，删掉手写的 class 开关。

## 要求

- 只改 workspace 里的源码，不要新增构建配置。
- 保持对外导出的函数名与调用方式不变。
- 改完直接用标准 API，不要引入第三方依赖。
