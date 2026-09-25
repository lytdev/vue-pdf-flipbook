# StPageFlip 生命周期修补

`page-flip.js` 基于 npm page-flip 2.0.7 的 ESM 分发文件，保留 MIT 授权，格式化后维护。

改动仅涉及资源生命周期：Render.start 保存动画帧句柄，stop 取消帧并释放页面/动画引用；PageFlip.destroy 幂等、容忍部分初始化，取消 init 延迟任务并释放事件/对象；UI.destroy 取消触摸延迟任务。

组件使用本地文件，不修改宿主的 requestAnimationFrame。更新上游时需保留这些修补并运行生命周期回归测试。许可证由 Vite 插件复制进 dist 发布包。
