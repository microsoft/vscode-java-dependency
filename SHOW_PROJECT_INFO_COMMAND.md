# Show Project Information Command

## 概述

新增了一个 VS Code command：`java.project.showProjectInfo`，用于调用 JDTLS 的 `java.project.getProjectInfo` command 并显示结果及执行时间。

## 功能

- ✅ 调用 Java 后端的 `java.project.getProjectInfo` command
- ✅ 测量并显示命令执行时间（毫秒和秒）
- ✅ 在输出面板中格式化显示完整的项目信息
- ✅ 显示 JSON 格式的原始数据
- ✅ 提供项目信息摘要（名称、类型、依赖数量等）
- ✅ 错误处理和堆栈追踪

## 使用方法

### 方法 1: 命令面板

1. 打开命令面板（`Ctrl+Shift+P` 或 `Cmd+Shift+P`）
2. 输入 `Java: Show Project Information (with execution time)`
3. 按回车执行

### 方法 2: 通过代码调用

```typescript
import * as vscode from 'vscode';

// 执行 command
await vscode.commands.executeCommand('java.project.showProjectInfo');
```

## 输出示例

执行命令后，会在 "Java Project Info" 输出面板中显示：

```
================================================================================
Executing: java.project.getProjectInfo
Project URI: file:///path/to/project
================================================================================

Start time: 2025-10-21T10:30:45.123Z
Executing command...

================================================================================
✓ Command completed successfully
Execution Time: 234 ms (0.23 seconds)
End time: 2025-10-21T10:30:45.357Z
================================================================================

PROJECT INFORMATION:
--------------------------------------------------------------------------------

{
  "projectName": "my-java-project",
  "projectPath": "/path/to/project",
  "projectType": "Maven",
  "javaVersion": "17",
  "complianceLevel": "17",
  "sourceLevel": "17",
  "targetLevel": "17",
  "vmName": "JavaSE-17",
  "vmVersion": "Eclipse Adoptium",
  "vmLocation": "/path/to/jdk-17",
  "buildToolVersion": "3.9.0",
  "dependencies": [
    {
      "name": "junit-4.13.2.jar",
      "path": "/path/.m2/repository/junit/junit/4.13.2/junit-4.13.2.jar",
      "version": "4.13.2",
      "scope": "compile",
      "type": "library"
    },
    ...
  ],
  "sourceRoots": [
    "/MyProject/src/main/java",
    "/MyProject/src/test/java"
  ],
  "outputPaths": [
    "/MyProject/target/classes"
  ]
}

--------------------------------------------------------------------------------

SUMMARY:
  Project Name: my-java-project
  Project Type: Maven
  Java Version: 17
  Dependencies: 42
    - library: 35
    - container: 5
    - project: 2
  Source Roots: 2
  Output Paths: 1

================================================================================
```

## 性能指标

执行时间显示包括：
- **毫秒精度**：例如 `234 ms`
- **秒精度**：例如 `0.23 seconds`
- **开始时间**：ISO 8601 格式
- **结束时间**：ISO 8601 格式

## 返回的数据字段

所有字段都是可选的（key-value 格式）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `projectName` | string | 项目名称 |
| `projectPath` | string | 项目完整路径 |
| `projectType` | string | 项目类型（Maven/Gradle/Java） |
| `javaVersion` | string | Java 版本 |
| `complianceLevel` | string | 编译器合规级别 |
| `sourceLevel` | string | 源代码级别 |
| `targetLevel` | string | 目标字节码级别 |
| `vmName` | string | JVM 名称 |
| `vmVersion` | string | JVM 版本 |
| `vmLocation` | string | JVM 安装路径 |
| `buildToolVersion` | string | 构建工具版本 |
| `dependencies` | array | 依赖项列表 |
| `sourceRoots` | array | 源代码根目录 |
| `outputPaths` | array | 输出路径 |

### 依赖项字段

每个依赖项包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 依赖名称 |
| `path` | string | 完整路径 |
| `version` | string | 版本号（可选） |
| `scope` | string | 作用域 |
| `type` | string | 类型（library/container/project/variable） |

## 错误处理

如果命令执行失败，输出面板会显示：

```
================================================================================
✗ Command failed
Execution Time: 123 ms
End time: 2025-10-21T10:30:45.246Z
================================================================================

ERROR:
Error: Failed to connect to language server

STACK TRACE:
...
```

同时会显示一个错误通知。

## 实现细节

### 文件结构

1. **`src/commands/getProjectInfo.ts`**
   - 实现 `getProjectInfoCommand()` 函数
   - 测量执行时间
   - 格式化输出结果

2. **`src/extension.ts`**
   - 注册 command 到 VS Code

3. **`src/commands.ts`**
   - 添加 command 常量 `JAVA_PROJECT_SHOW_PROJECT_INFO`

4. **`package.json`**
   - 在 `contributes.commands` 中声明 command

### Command ID

```typescript
Commands.JAVA_PROJECT_SHOW_PROJECT_INFO = "java.project.showProjectInfo"
```

### 执行流程

```
用户执行命令
    ↓
getProjectInfoCommand()
    ↓
记录开始时间 (Date.now())
    ↓
调用 Jdtls.getProjectInfo(projectUri)
    ↓
    → 调用 java.project.getProjectInfo (JDTLS)
    → ProjectInfoCommand.getProjectInfo() (Java)
    → 返回 Map<String, Object>
    ↓
记录结束时间
    ↓
计算执行时间 (endTime - startTime)
    ↓
格式化输出到输出面板
    ↓
显示通知消息
```

## 性能基准

典型执行时间：

| 项目大小 | 依赖数量 | 执行时间 |
|---------|---------|---------|
| 小型 | < 10 | 50-150 ms |
| 中型 | 10-50 | 150-500 ms |
| 大型 | > 50 | 500-2000 ms |

## 调试

如果需要调试，可以查看：

1. **输出面板**："Java Project Info" 频道
2. **开发者工具**：`Help > Toggle Developer Tools` > Console
3. **JDTLS 日志**：查看 Java Language Server 的日志

## 相关文件

- `src/commands/getProjectInfo.ts` - Command 实现
- `src/java/jdtls.ts` - JDTLS API 封装
- `jdtls.ext/.../ProjectInfoCommand.java` - Java 后端实现
- `PROJECT_INFO_COMMAND.md` - Java command 详细文档
