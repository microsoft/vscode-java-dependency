# Copilot Integration for Java Dependency Analysis

这个功能为 Copilot 提供了分析 Java 项目本地依赖的能力。

## 功能概述

`resolveCopilotRequest` 功能可以：
1. 解析指定 Java 文件的所有 import 语句
2. 过滤掉外部依赖（JAR 包、JRE 系统库等），只保留本地工程文件
3. 提取每个本地文件的类型信息（class、interface、enum、annotation）
4. 返回格式化的类型信息列表

## API 接口

### Java 后端 API

```java
public static String[] resolveCopilotRequest(List<Object> arguments, IProgressMonitor monitor)
```

**参数：**
- `arguments[0]`: 文件 URI 字符串 (如 "file:///path/to/MyClass.java")
- `monitor`: 进度监控器

**返回：**
- 字符串数组，每个元素格式为 `"type:fully.qualified.name"`
- `type` 可以是：`class`、`interface`、`enum`、`annotation`

### VS Code 扩展 API

```typescript
export async function resolveCopilotRequest(fileUri: string): Promise<string[]>
```

**参数：**
- `fileUri`: 文件 URI 字符串

**返回：**
- Promise<string[]>，解析到的本地类型信息

## 使用示例

### 1. 基本用法

```typescript
import { Uri } from "vscode";
import { CopilotHelper } from "./copilotHelper";

// 分析当前活动文件的本地导入
const currentFile = window.activeTextEditor?.document.uri;
if (currentFile) {
    const localImports = await CopilotHelper.resolveLocalImports(currentFile);
    console.log("Local imports:", localImports);
    // 输出示例：
    // [
    //   "class:com.example.model.User",
    //   "interface:com.example.service.UserService",
    //   "enum:com.example.enums.Status"
    // ]
}
```

### 2. 按类型分类

```typescript
const categorizedTypes = await CopilotHelper.getLocalImportsByType(currentFile);
console.log("Classes:", categorizedTypes.classes);
console.log("Interfaces:", categorizedTypes.interfaces);
console.log("Enums:", categorizedTypes.enums);

// 输出示例：
// Classes: ["com.example.model.User", "com.example.util.Helper"]
// Interfaces: ["com.example.service.UserService"]
// Enums: ["com.example.enums.Status"]
```

### 3. 获取类型名称列表

```typescript
const typeNames = await CopilotHelper.getLocalImportTypeNames(currentFile);
console.log("Type names:", typeNames);

// 输出示例：
// ["com.example.model.User", "com.example.service.UserService", "com.example.enums.Status"]
```

## 过滤逻辑

函数只返回**本地项目**中的类型，会过滤掉：
- ❌ 外部 JAR 包中的类
- ❌ JRE 系统库中的类（如 `java.util.List`）
- ❌ Maven/Gradle 依赖中的类
- ❌ 第三方库中的类

保留：
- ✅ 当前项目源码中的类
- ✅ 当前项目源码中的接口
- ✅ 当前项目源码中的枚举
- ✅ 当前项目源码中的注解

## 示例场景

假设有一个 Java 文件：

```java
package com.example.controller;

import java.util.List;                    // ❌ JRE 系统库，会被过滤
import org.springframework.web.bind.annotation.GetMapping; // ❌ 外部依赖，会被过滤
import com.fasterxml.jackson.annotation.JsonProperty;     // ❌ 外部依赖，会被过滤

import com.example.model.User;            // ✅ 本地项目类
import com.example.service.UserService;   // ✅ 本地项目接口
import com.example.enums.UserStatus;      // ✅ 本地项目枚举
import com.example.util.*;                // ✅ 本地项目包（会展开为具体类型）

public class UserController {
    // ...
}
```

调用 `resolveCopilotRequest` 会返回：
```
[
  "class:com.example.model.User",
  "interface:com.example.service.UserService", 
  "enum:com.example.enums.UserStatus",
  "class:com.example.util.DateHelper",
  "class:com.example.util.StringUtil"
]
```

## 错误处理

函数内置了错误处理机制：
- 如果文件不存在或无法解析，返回空数组
- 如果不是 Java 文件，返回空数组
- 如果项目不是 Java 项目，返回空数组
- 解析过程中的异常会被捕获并记录日志

## 性能考虑

- 使用缓存机制避免重复解析
- 支持进度监控和取消操作
- 懒加载包内容，只在需要时解析
- 对大型项目进行了优化

## 集成到 Copilot

这个功能专为 Copilot 设计，可以：
1. 帮助 Copilot 理解项目的本地代码结构
2. 提供上下文信息用于代码生成
3. 避免建议使用不存在的本地类型
4. 提高代码补全的准确性
