# 如何使用 getSymbolsFromFile 命令

我已经为 VS Code Java 依赖管理扩展添加了一个新的命令 `getSymbolsFromFile`，用于分析当前打开文件的本地项目符号。

## 使用方法

### 1. 通过键盘快捷键运行（推荐）

1. 在 VS Code 中打开一个 Java 文件
2. 按 `Ctrl+Shift+S` (Windows/Linux) 或 `Cmd+Shift+S` (macOS)
3. 查看开发者控制台输出结果

### 2. 通过命令面板运行

1. 在 VS Code 中打开一个 Java 文件
2. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS) 打开命令面板
3. 输入 `Get Local Symbols from Current File`
4. 按回车执行命令
5. 查看开发者控制台输出结果

### 3. 查看输出结果

执行命令后，会在以下地方看到结果：

**VS Code 通知消息：**
```
Found 5 local symbols. Check console for details.
```

**开发者控制台输出（按 F12 打开）：**
```
=== Local Symbols from Current File ===
File: /path/to/your/JavaFile.java
Total symbols found: 5
1. class:com.example.model.User
2. interface:com.example.service.UserService
3. enum:com.example.enums.Status
4. class:com.example.util.DateHelper
5. annotation:com.example.annotations.Entity

=== Categorized View ===
Classes (2): ["com.example.model.User", "com.example.util.DateHelper"]
Interfaces (1): ["com.example.service.UserService"]
Enums (1): ["com.example.enums.Status"]
Annotations (1): ["com.example.annotations.Entity"]
=== End ===
```

## 示例场景

### 示例 Java 文件

假设你有以下 Java 文件：

```java
package com.example.controller;

// 这些会被过滤掉（外部依赖）
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import com.fasterxml.jackson.annotation.JsonProperty;

// 这些会被分析（本地项目符号）
import com.example.model.User;
import com.example.service.UserService;
import com.example.enums.Status;
import com.example.util.*;  // 会展开为具体的类
import com.example.annotations.Entity;

@Entity
public class UserController {
    private UserService userService;
    
    @GetMapping("/users")
    public List<User> getUsers() {
        return userService.findByStatus(Status.ACTIVE);
    }
}
```

### 执行命令后的输出

```
=== Local Symbols from Current File ===
File: /workspace/src/main/java/com/example/controller/UserController.java
Total symbols found: 5
1. class:com.example.model.User
2. interface:com.example.service.UserService
3. enum:com.example.enums.Status
4. class:com.example.util.DateHelper
5. class:com.example.util.StringUtils
6. annotation:com.example.annotations.Entity

=== Categorized View ===
Classes (3): ["com.example.model.User", "com.example.util.DateHelper", "com.example.util.StringUtils"]
Interfaces (1): ["com.example.service.UserService"]
Enums (1): ["com.example.enums.Status"]
Annotations (1): ["com.example.annotations.Entity"]
=== End ===
```

## 功能特点

### ✅ 会分析的内容
- 本地项目中的类（class）
- 本地项目中的接口（interface）
- 本地项目中的枚举（enum）
- 本地项目中的注解（annotation）
- 包导入（`import com.example.util.*;`）会展开为具体类型

### ❌ 会过滤的内容
- JRE 系统库（如 `java.util.List`）
- 外部 JAR 包中的类
- Maven/Gradle 依赖中的类
- 第三方框架的类（如 Spring、Jackson 等）

## 错误处理

### 常见情况处理

1. **没有打开文件**
   ```
   Warning: No active editor found. Please open a Java file first.
   ```

2. **不是 Java 文件**
   ```
   Warning: Please open a Java file to get symbols.
   ```

3. **没有找到本地符号**
   ```
   === Local Symbols from Current File ===
   File: /path/to/file.java
   Total symbols found: 0
   No local project symbols found in imports.
   === End ===
   ```

4. **解析错误**
   ```
   Error: Error getting symbols: [具体错误信息]
   ```

## 开发者控制台

要查看详细的控制台输出：

1. 按 `F12` 打开开发者工具
2. 点击 "Console" 选项卡
3. 执行命令后查看输出
4. 可以看到完整的符号列表和分类信息

## 用途

这个命令主要用于：

1. **代码分析**：快速了解当前文件依赖了哪些本地项目组件
2. **代码重构**：在重构时了解文件间的依赖关系
3. **项目理解**：帮助快速理解代码结构和依赖关系
4. **Copilot 集成**：为 AI 代码助手提供本地项目上下文
5. **开发调试**：验证 import 语句是否正确引用本地组件
