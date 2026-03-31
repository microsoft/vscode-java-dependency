# vscode-java-dependency (Project Manager for Java)

VS Code Java 项目管理器，提供项目结构浏览和依赖管理。

## 项目定位

- **仓库**: https://github.com/microsoft/vscode-java-dependency
- **Extension ID**: vscjava.vscode-java-dependency
- **构建工具**: npm + Webpack
- **入口**: `main.js`

## 目录结构

```
src/
├── controllers/  # 命令和上下文管理
├── views/        # 项目浏览器树视图
├── tasks/        # 项目任务
├── java/         # JDT LS 集成
└── utility/      # 工具函数

server/
└── com.microsoft.jdtls.ext.core-*.jar  # JDT LS 扩展插件
```

## 关键功能

- Java Projects 树视图 (层级结构浏览)
- 创建/脚手架 Java 项目
- 管理引用库 (JAR 文件)
- 导出 JAR 功能
- 包和类成员浏览
- Copilot/AI 辅助探索支持

## 依赖关系

**依赖**: vscode-java (redhat.java)
**被依赖**: vscode-java-pack
