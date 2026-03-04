# Java Context Tools — 重新设计方案

## 设计哲学

```
旧模式（Push All）：                      新模式（Lazy Pull）：

  Copilot 补全请求                          AI 决定调什么
       ↓                                        ↓
  一次性推送所有内容                        按需逐层深入
       ↓                                        ↓
  3000+ tokens 噪音                        每次 < 200 tokens 精准信息
```

**核心原则：**
1. **AI 驱动调用**：AI 根据任务决定需要什么信息，而不是我们猜测它需要什么
2. **分层粒度**：摘要 → 签名 → 详情，每层独立可用
3. **每次 < 200 tokens**：宁可多调一次，不要一次塞 3000 tokens
4. **结构化 JSON**：AI 直接解析，不需要从文本中提取信息
5. **Skill 文档引导**：教 AI 什么时候用什么工具，形成高效工作流

---

## Tool 清单

### 总览

| Tool | 粒度 | 用途 | 典型 token 量 |
|------|------|------|--------------|
| `java_getProjectContext` | L0 | 项目级概览 | ~100 |
| `java_getFileImports` | L0 | 文件的 import 列表 | ~80 |
| `java_getClassDetail` | L1 | 单个类的签名+方法列表 | ~150 |
| `java_getDependencyDetails` | L1 | 指定依赖的 GAV+scope | ~50 |

### 与 LSP 标准 Tool 的配合

| 标准 LSP Tool（VS Code 内置命令封装） | 粒度 | 对应 LSP 请求 |
|--------------------------------------|------|-------------|
| `java_getFileStructure` | L0 | `textDocument/documentSymbol` |
| `java_findSymbol` | L0 | `workspace/symbol` |
| `java_getTypeAtPosition` | L1 | `textDocument/hover` (后处理) |
| `java_getCallHierarchy` | L1 | `callHierarchy/incomingCalls` + `outgoingCalls` |
| `java_getTypeHierarchy` | L1 | `typeHierarchy/supertypes` + `subtypes` |

---

## Tool 1: `java_getProjectContext`

**用途**：AI 进入一个 Java 项目时的第一个调用。快速了解项目是什么。

### 输入

```typescript
{
  fileUri: string  // 项目中任意一个文件的 URI
}
```

### 输出（示例，~100 tokens）

```json
{
  "project": {
    "name": "my-order-service",
    "buildTool": "Maven",
    "javaVersion": "17",
    "sourceLevel": "17",
    "targetLevel": "17",
    "sourceRoots": ["src/main/java", "src/test/java"],
    "moduleName": null
  },
  "dependencies": {
    "total": 47,
    "direct": [
      "org.springframework.boot:spring-boot-starter-web:3.2.1",
      "org.springframework.boot:spring-boot-starter-data-jpa:3.2.1",
      "com.google.code.gson:gson:2.10.1",
      "org.projectlombok:lombok:1.18.30"
    ],
    "directCount": 8,
    "transitiveCount": 39
  },
  "projectReferences": ["common-lib", "shared-model"]
}
```

**关键设计决策：**
- `dependencies.direct` 只列直接依赖的 GAV（不列传递依赖——AI 很少需要）
- 传递依赖只给个数量，AI 需要时再用 `java_getDependencyDetails` 深入
- `sourceRoots` 帮助 AI 理解项目结构，知道源码在哪

### Java 后端命令

```
java.project.getProjectContext(fileUri) → ProjectContextResult
```

---

## Tool 2: `java_getFileImports`

**用途**：快速了解一个 Java 文件引用了哪些类型，但不展开细节。

### 输入

```typescript
{
  fileUri: string  // Java 文件的 URI
}
```

### 输出（示例，~80 tokens）

```json
{
  "file": "src/main/java/com/example/OrderService.java",
  "imports": [
    { "name": "com.example.model.Order",         "kind": "class",     "source": "project" },
    { "name": "com.example.model.OrderStatus",    "kind": "enum",      "source": "project" },
    { "name": "com.example.repo.OrderRepository", "kind": "interface", "source": "project" },
    { "name": "org.springframework.stereotype.Service", "kind": "annotation", "source": "external", "artifact": "spring-context" },
    { "name": "org.springframework.transaction.annotation.Transactional", "kind": "annotation", "source": "external", "artifact": "spring-tx" },
    { "name": "java.util.List",                   "kind": "interface", "source": "jdk" },
    { "name": "java.util.Optional",               "kind": "class",     "source": "jdk" }
  ],
  "staticImports": [
    { "name": "org.junit.Assert.assertEquals",    "memberKind": "method", "source": "external" }
  ]
}
```

**关键设计决策：**
- `source` 三分法：`"project"` / `"external"` / `"jdk"` —— AI 最需要了解的是 `project` 的类
- `kind` 直接给出类型类别，AI 不需要额外查
- JDK 类标记为 `"jdk"` 而非 `"external"`，AI 知道不需要深入查
- `artifact` 字段只对 external 有效，帮助 AI 关联到具体依赖

### Java 后端命令

```
java.project.getFileImports(fileUri) → FileImportsResult
```

---

## Tool 3: `java_getClassDetail`

**用途**：AI 确定需要了解某个类后，获取它的签名级别信息。

### 输入

```typescript
{
  qualifiedName: string  // 全限定类名，如 "com.example.model.Order"
  fileUri?: string       // 可选：提供 file context 加速查找
}
```

### 输出（项目内源码类，~150 tokens）

```json
{
  "qualifiedName": "com.example.model.Order",
  "kind": "class",
  "uri": "file:///workspace/src/main/java/com/example/model/Order.java",
  "source": "project",
  "signature": "public class Order implements Serializable",
  "superClass": "java.lang.Object",
  "interfaces": ["java.io.Serializable"],
  "javadocSummary": "Represents a customer order with line items and pricing.",
  "constructors": [
    "Order()",
    "Order(String orderId, Customer customer)"
  ],
  "methods": [
    "String getOrderId()",
    "Customer getCustomer()",
    "List<OrderItem> getItems()",
    "OrderStatus getStatus()",
    "void setStatus(OrderStatus status)",
    "BigDecimal getTotalPrice()",
    "void addItem(OrderItem item)",
    "void removeItem(String itemId)"
  ],
  "fields": [
    "private String orderId",
    "private Customer customer",
    "private List<OrderItem> items",
    "private OrderStatus status"
  ],
  "annotations": ["@Entity", "@Table(name = \"orders\")"]
}
```

### 输出（外部依赖类，~80 tokens，更精简）

```json
{
  "qualifiedName": "com.google.gson.Gson",
  "kind": "class",
  "source": "external",
  "artifact": "com.google.code.gson:gson:2.10.1",
  "signature": "public final class Gson",
  "javadocSummary": "This is the main class for using Gson.",
  "methods": [
    "String toJson(Object src)",
    "<T> T fromJson(String json, Class<T> classOfT)",
    "<T> T fromJson(String json, Type typeOfT)",
    "<T> T fromJson(Reader json, Type typeOfT)",
    "JsonElement toJsonTree(Object src)",
    "... (38 more public methods)"
  ]
}
```

**关键设计决策：**
- 项目源码给完整信息（含 fields、annotations）
- 外部依赖只给签名级别，方法超过一定数量用 `"... (N more)"` 截断
- 不给 JavaDoc 全文，只给第一句 summary
- `artifact` 字段帮 AI 关联到 pom.xml 中的依赖声明

### Java 后端命令

```
java.project.getClassDetail(qualifiedName, fileUri?) → ClassDetailResult
```

---

## Tool 4: `java_getDependencyDetails`

**用途**：AI 需要了解某个具体依赖的详细信息（排查版本冲突、检查 scope 等）。

### 输入

```typescript
{
  fileUri: string       // 项目中的文件 URI（用于定位项目）
  query?: string        // 可选：按名称过滤依赖（模糊匹配）
}
```

### 输出（示例，~120 tokens）

```json
{
  "dependencies": [
    {
      "groupId": "com.google.code.gson",
      "artifactId": "gson",
      "version": "2.10.1",
      "scope": "compile",
      "isDirect": true,
      "jarPath": "gson-2.10.1.jar"
    },
    {
      "groupId": "com.google.errorprone",
      "artifactId": "error_prone_annotations",
      "version": "2.18.0",
      "scope": "compile",
      "isDirect": false,
      "broughtBy": "com.google.guava:guava:32.1.3-jre",
      "jarPath": "error_prone_annotations-2.18.0.jar"
    }
  ]
}
```

**关键设计决策：**
- `query` 参数支持模糊搜索，AI 不需要拉全量依赖列表
- `broughtBy` 告诉 AI 传递依赖是谁引入的（排查冲突的关键信息）
- `isDirect` + `scope` 帮 AI 判断依赖的实际作用范围

### Java 后端命令

```
java.project.getDependencyDetails(fileUri, query?) → DependencyDetailsResult
```

---

## Tool 5-9: 标准 LSP 能力封装

这些工具直接封装 VS Code 内置命令，不需要新的 Java 后端命令。

### Tool 5: `java_getFileStructure`

封装 `vscode.executeDocumentSymbolProvider`，返回文件的类/方法/字段树。

### Tool 6: `java_findSymbol`

封装 `vscode.executeWorkspaceSymbolProvider`，全局模糊搜索符号。

### Tool 7: `java_getTypeAtPosition`

封装 `vscode.executeHoverProvider` + 后处理提取类型签名。

### Tool 8: `java_getCallHierarchy`

封装 `vscode.prepareCallHierarchy` + `vscode.provideIncomingCalls` / `vscode.provideOutgoingCalls`。

### Tool 9: `java_getTypeHierarchy`

封装 `vscode.prepareTypeHierarchy` + `vscode.provideSupertypes` / `vscode.provideSubtypes`。

---

## 实现架构

```
┌────────────────────────────────────────────────────────────┐
│  Copilot Chat (LLM)                                        │
│    ↓ 读取 skill 文档了解工具用法                              │
│    ↓ 根据任务决定调用哪个工具                                  │
│  LanguageModelTool 接口（package.json 注册）                  │
│    ↓                                                        │
│  TS 适配层（src/copilot/tools/*.ts）                         │
│    ↓                                                        │
│    ├── Tool 1-4: delegateCommandHandler → jdtls 扩展命令     │
│    └── Tool 5-9: vscode.commands.executeCommand → LSP 标准   │
│                                                              │
│  Java 后端（jdtls.ext）                                      │
│    ├── java.project.getProjectContext                        │
│    ├── java.project.getFileImports                          │
│    ├── java.project.getClassDetail                          │
│    └── java.project.getDependencyDetails                    │
└────────────────────────────────────────────────────────────┘
```
