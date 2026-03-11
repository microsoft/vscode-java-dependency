# LSP 能力对 AI 辅助 Java 开发的价值分析与工具设计建议

## 一、背景：Java 的特殊性

### Java 与其他语言的依赖管理对比

| 语言 | 依赖声明 | 锁文件/解析结果 | AI 能否静态获取完整依赖信息 |
|------|---------|----------------|------------------------|
| **Java (Maven)** | `pom.xml` | 无标准锁文件 | ❌ 传递依赖需构建工具解析 |
| **Java (Gradle)** | `build.gradle`（代码） | `gradle.lockfile`（可选，少人用） | ❌ DSL 是代码，无法静态解析 |
| **.NET** | `.csproj` | `project.assets.json`（自动生成） | ✅ 读 JSON 文件即可 |
| **Go** | `go.mod` | `go.sum` | ✅ 确定性解析，读文件即可 |
| **Rust** | `Cargo.toml` | `Cargo.lock` | ✅ 读文件即可 |
| **Node.js** | `package.json` | `package-lock.json` / `yarn.lock` | ✅ 读文件即可 |

**Java 是主流语言中唯一没有标准化、人类/机器可读的依赖解析结果落盘机制的。** 这使得 AI 处理 Java 项目时比其他语言更容易出错。

### Java 让 AI 更容易出错的语言特征

| Java 特征 | 为什么 AI 更难 |
|-----------|---------------|
| 强类型 + 泛型擦除 | 源码中的类型信息不完整，真实类型需要编译器推断 |
| 依赖管理是间接的 | import 和 Maven artifact 是两层映射，不像 Python 的 `import requests` 直接对应 pip 包名 |
| 构建系统是"活"的 | Gradle DSL 是代码，Maven 有继承/profile，不能静态读取 |
| 模块化程度高 | 企业项目动辄几十个模块，类的来源不直观 |
| 向后兼容重但有断裂点 | javax → jakarta、Java module system、API 废弃 |

---

## 二、jdtls delegateCommandHandler 扩展命令评估

### 5 个被识别为"不可替代"的命令

| 命令 | 来源 | 不可替代原因 |
|------|------|-------------|
| `resolveClasspath` | java-debug | 完整传递依赖图，含版本仲裁、profile 激活、Gradle 动态依赖 |
| `isOnClasspath` | java-debug | 运行时 classpath 实际状态，区分"声明"与"实际生效" |
| `resolveElementAtSelection` | java-debug | 编译器级语义信息：泛型推断、重载决议、类型绑定 |
| `getDependencies` | java-dependency | 已解析的依赖树 + Java 版本 + 模块信息 + JAR 实际路径 |
| `jacoco.getCoverageDetail` | java-test | 运行时字节码插桩产生的行级覆盖率数据 |

### 鸡生蛋问题：这些命令的可靠性悖论

这些命令有一个根本性问题：**AI 最需要它们的时候，恰恰是它们最不可靠的时候。**

| 项目状态 | jdtls 状态 | 命令可用性 | AI 对命令的需求 |
|---------|-----------|-----------|---------------|
| 正常编译通过 | 完全工作 | ✅ 全部可用 | 低——项目没问题，AI 读源码基本够用 |
| 源码有编译错误但依赖正确 | 部分工作 | ⚠️ 依赖命令可用，类型解析部分受影响 | 中 |
| pom.xml/build.gradle 有语法错误 | M2E/Buildship 导入失败 | ❌ 依赖命令全部失效 | 高——但恰好用不了 |
| 依赖下载失败（网络/仓库问题） | 部分导入 | ⚠️ 返回不完整的依赖树 | 高——返回的信息可能误导 AI |
| Java 版本升级中间状态 | 取决于具体阶段 | ⚠️ 不确定 | 最高——但最不可靠 |
| 新 clone 的项目未导入 | 未初始化 | ❌ 全部失效 | 高 |

**修正后的价值评估：**

| 命令 | 修正前价值 | 考虑可靠性后 | 说明 |
|------|----------|------------|------|
| `getDependencies` / `resolveClasspath` | ⭐⭐⭐ | ⭐⭐ | 项目正常时有用，但正常时需求低 |
| `isOnClasspath` | ⭐⭐⭐ | ⭐ | 返回 false 时无法区分"不可用"和"jdtls 不知道" |
| `resolveElementAtSelection` | ⭐⭐⭐ | ⭐⭐ | 编译错误多时类型绑定不可靠 |
| `jacoco.getCoverageDetail` | ⭐⭐⭐ | ⭐⭐⭐ | 离线数据，不受 jdtls 实时状态影响——唯一例外 |

**真正的价值区间：** 项目处于"亚健康"状态时（核心结构正确，依赖大部分已解析，但有局部的编译错误或依赖问题），jdtls 命令能提供大部分正确的上下文信息。这大约占所有场景的 40-60%。

---

## 三、AI 处理 Java 项目时天然吃力的任务类型

### 类型 1：跨依赖边界的修改

修改涉及的代码不只在项目源码中，还取决于依赖库提供的 API、类型、行为。

- 升级框架版本后适配 API 变更
- 替换一个第三方库为另一个库（如 Gson → Jackson）
- 修复因依赖版本冲突导致的运行时错误

**AI 失败模式：** AI 对"项目边界之外"是盲的——不知道 classpath 上的依赖到底提供了哪些类和方法签名。

### 类型 2：类型推断密集的代码修改

修改大量依赖编译器类型推断能力的代码，源码文本不包含完整类型信息。

- 重构使用了 `var`、Lambda、Stream 链式调用的代码
- 修改泛型类/方法的签名，需要判断所有调用点是否兼容
- 在有多个重载方法的类中添加新方法，需要确保不会导致调用歧义

**AI 失败模式：** AI 看到 `var list = getItems()` 但不知道 `list` 是 `List<String>` 还是 `List<ItemDTO>`。

### 类型 3：构建配置与源码的联动修改

修改不仅涉及 `.java` 文件，还涉及构建配置（pom.xml / build.gradle），且两者必须保持一致。

- 添加新功能需要引入新依赖
- 多模块项目中拆分/合并模块
- 修改编译器参数

**AI 失败模式：** AI 可能添加了代码中的 import 但忘记加依赖，或者加了依赖但版本与已有版本冲突。

### 类型 4：编译错误的诊断与修复

项目处于编译失败状态，AI 需要从错误信息定位到根因并修复。

- 拉取最新代码后编译不过
- 升级 JDK 版本后编译失败
- merge 之后的冲突解决导致类型不匹配

**AI 失败模式：** 编译错误信息指向"症状"，根因可能在传递依赖链里。**编译失败时 `mvn dependency:tree` 可能也跑不出来**，但 jdtls 的 `getDependencies` 基于 M2E 增量解析可能仍可用。

### 类型 5：多模块项目中的跨模块修改

修改需要横跨多个 Maven/Gradle 模块，涉及模块间的依赖关系和 API 契约。

- 修改公共模块中的接口，需要同步更新所有依赖模块
- 将一个类从 module-A 移动到 module-B
- 判断某个功能应该放在哪个模块中

**AI 失败模式：** AI 不清楚模块间的依赖方向，把一个类移到错误的模块会导致循环依赖。

### 类型 6：运行时行为相关的代码修改

修改的正确性不仅取决于编译通过，还取决于运行时行为。

- 修改了序列化/反序列化逻辑
- 修改了 Spring Bean 的注入方式
- 修改了异常处理路径

**AI 失败模式：** 代码改完编译通过，但运行时行为不对。

### 共同内核

**这 6 类场景的共同点：代码修改的正确性取决于源码文本之外的信息。**

- 类型 1-3：正确性取决于「构建系统的状态」
- 类型 2：正确性取决于「编译器的推断结果」
- 类型 4-5：诊断的准确性取决于「项目的结构化元信息」
- 类型 6：正确性取决于「运行时状态」

---

## 四、LSP 标准能力 vs delegateCommandHandler 扩展能力

### 已有基线：`list_code_usages` 的覆盖范围

VS Code 当前已向 AI 暴露了 `list_code_usages` 工具，其底层基于 LSP 的 `textDocument/references` + `textDocument/definition` + `textDocument/implementation`。在评估新 LSP tool 前，需要明确它已经覆盖了什么、还缺什么：

**`list_code_usages` 已覆盖的能力：**

| 能力 | 底层 LSP 请求 | 说明 |
|------|-------------|------|
| 引用查找 | `textDocument/references` | 找到所有使用某符号的位置 |
| 定义跳转 | `textDocument/definition` | 定位符号定义 |
| 实现查找 | `textDocument/implementation` | 找接口的实现类 |

**新方向与 `list_code_usages` 的关系：**

| 新方向 | 与 `list_code_usages` 的关系 | 增量价值 |
|--------|---------------------------|--------|
| Document Symbol | 完全正交——usages 找"谁用了这个符号"，Symbol 回答"这个文件里有什么" | **高**——省去 read_file 全文 |
| Type Query（Hover 后处理） | 完全正交——usages 不提供类型信息 | **最高**——解决 `var`/泛型/Lambda 的类型盲区 |
| Workspace Symbol | 部分重叠——usages 需已知符号名，Workspace Symbol 支持模糊搜索 | **中高**——解决"大概知道叫什么但不确定"的场景 |
| Call Hierarchy | 是 usages 的升级版——usages 返回所有引用（含 import、注释、声明），Call Hierarchy 只返回调用关系，且支持方向性 | **高**——更精确的影响分析 |
| Type Hierarchy | usages 找 `implements X` 的文本，Type Hierarchy 包含间接继承、匿名类、Lambda | **高**——完整的继承图 |

**定位建议：** 新 LSP tool 不是从零开始，而是在 `list_code_usages` 已验证的路径上填补缺口。Call Hierarchy 可以定位为「`list_code_usages` 的精确版」——usages 返回的结果中 import、声明、注释、实际调用混在一起，Call Hierarchy 直接给出纯调用关系，省掉筛选 token。

### 本质区别

| | delegateCommandHandler (resolveClasspath 等) | 标准 LSP 能力 (hover/hierarchy 等) |
|--|---------------------------------------------|----------------------------------|
| Java 特有 | 是 | 否——任何有 LSP 的语言都适用 |
| 鸡生蛋问题 | 严重——依赖解析失败就全挂 | 轻微——只要文件能解析就能工作 |
| 解决什么问题 | Java 依赖管理的设计缺陷 | AI 的 context 窗口和推理精度限制 |
| 可替代性 | 部分不可替代 | AI 理论上可以自己做，但成本高出几个数量级 |

**标准 LSP 能力的核心价值不是"提供 AI 做不到的能力"，而是"用毫秒级查询替代百万 token 推理"。**

### AI 当前的代码导航方式

```
当前 AI 处理 Java 代码的工具栈：

  文本搜索（grep/semantic_search）  ████████████████  ← 主要依赖
  LSP 引用查找（list_code_usages）  ████              ← 有但用得少
  终端命令（mvn/javac）             ████              ← 兜底
  jdtls 扩展命令（delegateCommand） ☐                 ← 基本未暴露
  LSP 高级能力（hover/hierarchy）   ☐                 ← 未暴露

理想的 AI 处理 Java 代码的工具栈：

  LSP 核心能力（引用/定义/类型/层次）████████████████  ← 主力
  jdtls 扩展命令（依赖/classpath）  ████████          ← 项目级理解
  文本搜索（grep）                  ████              ← 快速初筛
  终端命令                          ██                ← 降级兜底
```

---

## 五、LSP Tool 设计建议

### 方向 1：文件结构摘要（P0 — 最高优先级）

**对应 LSP 请求：** `textDocument/documentSymbol`

**当前痛点：**

AI 理解一个 Java 文件结构，需要 `read_file` 读全部内容（~2000 tokens），然后用推理能力提取结构。

**LSP 替代效果：**

```
一次 documentSymbol 请求返回：
  class OrderService
    ├── field: orderRepo (OrderRepository)
    ├── method: createOrder(req: CreateOrderRequest): Order     [line 45-80]
    ├── method: cancelOrder(orderId: String): void              [line 82-95]
    └── method: getOrders(userId: String): List<Order>          [line 97-120]

消耗：~100 tokens（结构化数据），节省 90%+
```

**调研要点：**
- `DocumentSymbol[]`（树形）vs `SymbolInformation[]`（扁平），jdtls 返回哪种
- 返回信息是否包含参数类型、返回类型、泛型参数、注解
- 跨语言一致性：TypeScript、Python、Go 的 Language Server 返回格式是否统一
- 性能：大文件（1000+ 行）上的响应延迟

**预期收益：** 文件结构理解的 token 消耗降低 **90%+**。AI 先看摘要，再按需读具体方法。

---

### 方向 2：类型查询（P0.5 — 高优先级，需封装）

**对应 LSP 请求：** `textDocument/hover`（需后处理）

#### UI 层 vs 协议层的辨析

`textDocument/hover` 需要区分两个层面：

| 层面 | 含义 | AI 是否需要 |
|------|------|------------|
| **UI 层**——鼠标悬停弹出 tooltip | 人看的浮窗 | 不需要 |
| **协议层**——LSP 请求 | 给定 (file, line, col) 返回该位置的类型/文档信息 | **需要数据，不需要 UI** |

`textDocument/hover` 本质上是一个 **位置→类型信息** 的查询 API，AI 可以纯程序化调用，不需要任何 UI 交互。但关键问题是：**hover 返回的内容是为人设计的，不是为 AI 设计的。**

jdtls 的 `textDocument/hover` 返回 **MarkupContent（Markdown）**，例如：

```markdown
**String** java.lang.String

The `String` class represents character strings. All string literals in Java programs...
（后面跟几百字的 Javadoc）
```

对 AI 来说：
- **有用的**：`String` 这个类型签名（~5 tokens）
- **没用的**：Javadoc 内容（~200 tokens 的噪音）

#### 从 P0 降级到 P0.5 的原因

| 因素 | 说明 |
|------|------|
| 返回格式非结构化 | Markdown 文本，需要正则提取类型签名 |
| 夹带大量噪音 | Javadoc 内容对 AI 是纯 token 浪费 |
| 跨语言不一致 | 不同 Language Server 的 Markdown 格式不统一，解析逻辑脆弱 |
| 需要封装层 | 必须在 tool 层做后处理，命名为 `get_type_at_position` 而非 `hover` |

**结论：LSP 标准协议里没有一个"干净的、为程序消费设计的类型查询 API"。Hover 是最接近的，但需要额外封装。** 能力本身依然关键（解决 var/泛型/Lambda 的类型盲区），但实现需要更多工作。

#### 类型查询的替代方案对比

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| Hover + 后处理 | 调用 `textDocument/hover`，正则提取首个 code block 中的类型签名 | 现成 API，jdtls 实现成熟 | 返回格式不标准，解析逻辑脆弱 |
| `resolveElementAtSelection`（jdtls 扩展） | 返回编译器级语义信息 | 比 hover 更结构化，为程序消费设计 | 有鸡生蛋问题 |
| Semantic Tokens | 返回每个 token 的类型分类 | 无噪音 | **不返回具体类型**（只知"是变量"，不知"是 List\<String\>"） |

**推荐方案：Hover + 后处理封装。** 在 tool 层拦截 hover 返回，只提取类型签名部分。

**当前痛点：**

```java
var result = service.getOrders(userId).stream()
    .filter(o -> o.getStatus() == Status.ACTIVE)
    .collect(Collectors.groupingBy(Order::getCategory));
```

AI 要知道 `result` 的类型，需要跨多个文件追踪方法返回类型（~1000+ tokens + 可能推断错误）。

**LSP 替代效果（后处理后）：**

```
get_type_at_position(file, line, column of "result")
  → "Map<String, List<Order>>"

消耗：~20 tokens，准确率 100%
```

**调研要点：**
- `textDocument/hover` 返回内容格式（MarkupContent / 纯文本 / 结构化类型信息）
- jdtls 的 hover 在不同位置（变量、方法调用、字段访问、Lambda 参数）返回的 Markdown 格式差异
- 类型签名提取的正则是否能覆盖 jdtls 的主要返回模式
- 是否能用于 JAR 中的类（依赖库的类型信息）
- 大型项目上 hover 请求的 P99 延迟

**预期收益：** 类型推断场景的 token 消耗降低 **95%**，准确率从"AI 推理猜测"提升到"编译器精确结果"。

---

### 方向 3：全局符号搜索（P0 — 最高优先级）

**对应 LSP 请求：** `workspace/symbol`

**当前痛点：**

```
AI 想找 "PaymentGateway" 类：
  grep_search("PaymentGateway") → 命中 30 个结果（含注释、字符串、import 语句）
  → AI 逐个识别哪个是定义 → 消耗 token + 时间
```

**LSP 替代效果：**

```
workspaceSymbol("PaymentGateway")
  → [
      { name: "PaymentGateway", kind: Interface, location: "src/.../PaymentGateway.java:15" },
      { name: "PaymentGatewayImpl", kind: Class, location: "src/.../PaymentGatewayImpl.java:8" }
    ]

精确命中，无噪音
```

**调研要点：**
- 支持的查询模式（前缀匹配？模糊匹配？驼峰缩写匹配如 `PG` → `PaymentGateway`？）
- jdtls 是否能搜索到 JAR 中的类
- 返回结果的数量限制和分页机制
- 与 VS Code 的 `Go to Symbol in Workspace`（Ctrl+T）底层是否一致

**预期收益：** 符号定位从"grep 30 个结果 + AI 筛选"变为"直接命中精确结果"。

---

### 方向 4：调用链查询（P1）

**对应 LSP 请求：** `textDocument/prepareCallHierarchy` + `callHierarchy/incomingCalls` / `outgoingCalls`

**当前痛点：**

AI 修改方法前需要知道调用方，`grep` 或 `list_code_usages` 返回所有引用（声明、import、调用混在一起），AI 需自行判断哪些是真正的调用。

**LSP 替代效果：**

```
incomingCalls("UserService.deleteUser")
  → [
      { from: "UserController.handleDelete()", location: "UserController.java:45" },
      { from: "AdminJob.cleanup()", location: "AdminJob.java:78" }
    ]
只有调用关系，没有噪音
```

**调研要点：**
- 请求流程：先 `prepareCallHierarchy` 再 `incomingCalls` / `outgoingCalls`
- jdtls 的实现完整度（是否支持跨模块、多态调用）
- 调用深度——是否支持递归展开（A→B→C 的完整调用链）
- 大型项目上查询被广泛调用方法时的延迟

**预期收益：** AI 做修改影响分析时从"grep + 推理筛选"变为"精确的调用关系图"。

---

### 方向 5：类型继承层次（P1）

**对应 LSP 请求：** `textDocument/prepareTypeHierarchy` + `typeHierarchy/supertypes` / `subtypes`

**当前痛点：**

```
grep "implements Processor" → 只找到显式实现，漏掉：
  - 间接实现（class A extends B，B implements Processor）
  - 匿名类实现
  - Lambda 实现
  - 方法引用实现
```

**LSP 替代效果：**

```
subtypes("Processor")
  → [StringProcessor, NumberProcessor, (anonymous class at App.java:30), (lambda at App.java:35)]
```

**调研要点：**
- jdtls 是否能识别 Lambda 和匿名类作为接口实现
- 是否支持递归展开（查 C 的 subtypes 时返回间接子类 A）
- supertypes 方向是否包含接口和类继承链

**预期收益：** 接口/抽象类修改时的影响分析精确度从 ~70% 提升到 ~100%。

---

### 不建议优先调研的方向

| 方向 | 为什么优先级低 |
|------|-------------|
| Semantic Tokens | 信息量有限，AI 从上下文基本能推断标识符角色 |
| Code Actions / Refactoring | 实现复杂（需要 apply workspace edit），AI 直接编辑文件目前够用 |
| Rename | 实现复杂，AI 用 `list_code_usages` + 手动替换可以凑合 |
| Completion | AI 自己的补全能力已经很强，LSP 补全反而可能不如 LLM |
| Signature Help | hover 已经覆盖了大部分需求 |

---

## 六、投入产出比总览

### 修正后的优先级排序

考虑 UI/API 适配度和已有 `list_code_usages` 基线后的修正评估：

| 优先级 | LSP 能力 | AI 获得的能力 | Token 节省 | 实现复杂度 | 与已有工具关系 |
|--------|---------|-------------|-----------|-----------|---------------|
| **P0** | Document Symbol（文件结构摘要） | 快速理解文件结构，节省 context | ~90% | 低——单次请求，返回天然结构化 | 完全正交，全新能力 |
| **P0** | Workspace Symbol（全局符号搜索） | 精确符号定位 | ~80% | 低——单次请求，返回天然结构化 | 精确替代 grep |
| **P0.5** | Type Query（基于 Hover 后处理） | 精确类型推断 | ~95% | 中——需从 Markdown 提取类型签名 | 完全正交，全新能力 |
| **P1** | Call Hierarchy（调用链） | 修改影响分析 | ~70% | 低——两步请求 | `list_code_usages` 的精确版 |
| **P1** | Type Hierarchy（继承层次） | 接口实现分析 | ~60% | 低——两步请求 | 覆盖 usages 的间接继承盲区 |

### 变更说明

- **Document Symbol 和 Workspace Symbol 保持 P0**：返回数据天然结构化，零 UI 依赖，实现最简单
- **Hover（类型查询）从 P0 降为 P0.5**：能力关键但返回格式为人设计（Markdown），需要额外封装后处理层
- **Call Hierarchy 定位调整**：明确为 `list_code_usages` 的精确升级版，而非全新能力

---

## 七、调研实施路径

### 第一步：验证可行性（1-2 天）

- 在 VS Code 扩展 API 中直接调用这些 LSP 请求
- 用一个中等规模 Java 项目测试返回数据格式和延迟
- 确认 jdtls 对每个请求的实现完整度

### 第二步：量化收益（2-3 天）

- 找 10 个典型的 AI 辅助编码任务
- 记录当前方式消耗的 token 数和耗时
- 模拟用 LSP tool 后消耗的 token 数和耗时
- 计算实际节省比例

### 第三步：确定优先级（1 天）

- 按 (收益 × 使用频率) / 实现成本 排序
- 选 2-3 个最高 ROI 的实现

### 核心判断标准

**不是"这个 LSP 能力多强大"，而是"AI 当前在这个环节花了多少 token / 时间，LSP 能省掉多少"。**

---

## 八、关于 Benchmark 的建议

### 正确的出发点

```
❌ 错误：jdtls/LSP 有什么能力 → 构造场景证明它有用
✅ 正确：开发者日常做什么 → AI 在哪里失败/低效 → 失败原因是否是缺少编译器状态/LSP 信息
```

### 适合的 Benchmark 类型

msbench 的 Java Upgrade 类任务是一个很好的切入点——升级后依赖未同步的 case 天然暴露了 AI 在依赖理解方面的不足。这类场景中：

- 项目往往处于"编译不过"的中间状态
- `mvn dependency:tree` 可能也跑不出来
- 但 jdtls/M2E 的增量解析在部分情况下仍然可用

### 更 General 的 Benchmark 定位

不针对特定命令设计题目，而是定义**开发者日常任务类型**，在真实开源项目上执行，观察加入 LSP 工具后的改善：

| 度量指标 | 含义 |
|---------|------|
| 编译通过率 | 生成/修改的代码能否直接编译通过 |
| Token 消耗 | 完成同一任务消耗的 token 数 |
| 轮次 | 完成任务需要的交互轮数 |
| 首次正确率 | 第一次输出就正确的比例 |
| 人工修正量 | 需要人工修改多少行才能达到可用状态 |

### 本质结论

LSP 能力对 AI 的价值是**效率工具**而非**能力扩展**。它不让 AI 做到之前做不到的事，而是让 AI 用毫秒级查询替代百万 token 推理，把已经能做的事做得更快、更省、更准。对于中大型 Java 项目，这个效率差距足以决定 AI 辅助的实用性。

---

## 九、实现架构：如何将 LSP 能力暴露给 AI

### 三种实现路径对比

| 路径 | 机制 | AI 如何调用 | 适用场景 |
|------|------|-----------|----------|
| **A. `LanguageModelTool`** | 扩展注册 `vscode.lm.registerTool()` | Copilot Chat 自动发现并调用 | **推荐——最正式的方式** |
| **B. VS Code 内置命令** | `vscode.commands.executeCommand()` | AI 通过已有 tool（如 `run_vscode_command`）间接调用 | 快速验证 / PoC |
| **C. MCP Server** | 独立进程，通过 MCP 协议通信 | 任何支持 MCP 的 AI 客户端 | 跨编辑器 / 跨 AI 客户端 |

### 推荐路径：LanguageModelTool

这是 VS Code 为「给 AI 提供工具」专门设计的 API，Copilot Chat 原生支持工具发现和调用。

#### 架构图

```
┌─────────────────────────────────────────┐
│  Copilot Chat (LLM)                     │
│    ↓ 调用 tool                           │
│  LanguageModelTool 接口                  │
│    ↓                                     │
│  你的 VS Code Extension                  │
│    ↓ 内部调用 VS Code API                │
│  vscode.commands.executeCommand(...)     │
│    ↓                                     │
│  jdtls (Language Server)                 │
└─────────────────────────────────────────┘
```

#### VS Code 内置命令与 LSP 请求的映射

这些命令已存在于 VS Code 中，不需要自己实现 LSP 客户端：

```typescript
// 文件级
'vscode.executeDocumentSymbolProvider'    // → textDocument/documentSymbol
'vscode.executeHoverProvider'             // → textDocument/hover

// 工作区级
'vscode.executeWorkspaceSymbolProvider'   // → workspace/symbol

// 导航（list_code_usages 已覆盖）
'vscode.executeDefinitionProvider'        // → textDocument/definition
'vscode.executeReferenceProvider'         // → textDocument/references
'vscode.executeImplementationProvider'    // → textDocument/implementation

// 层次结构
'vscode.prepareCallHierarchy'            // → textDocument/prepareCallHierarchy
'vscode.provideIncomingCalls'            // → callHierarchy/incomingCalls
'vscode.provideOutgoingCalls'            // → callHierarchy/outgoingCalls
'vscode.prepareTypeHierarchy'            // → textDocument/prepareTypeHierarchy
'vscode.provideSupertypes'              // → typeHierarchy/supertypes
'vscode.provideSubtypes'                // → typeHierarchy/subtypes
```

**核心认知：实现层几乎没有复杂度——VS Code 已经把 LSP 封装好了，只需要写一个薄薄的 LanguageModelTool 适配层。**

### 实现示例

#### Tool 1：文件结构摘要（P0）

```typescript
import * as vscode from 'vscode';

vscode.lm.registerTool('java_fileStructure', new FileStructureTool());

class FileStructureTool implements vscode.LanguageModelTool<{ uri: string }> {

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ uri: string }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {

    const uri = vscode.Uri.parse(options.input.uri);

    // 调用 VS Code 内置命令 → 内部转发给 jdtls 的 textDocument/documentSymbol
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider', uri
    );

    // 格式化为 AI 友好的结构化文本
    const summary = this.formatSymbols(symbols, 0);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(summary)
    ]);
  }

  private formatSymbols(symbols: vscode.DocumentSymbol[], indent: number): string {
    return symbols.map(s => {
      const prefix = '  '.repeat(indent);
      const kind = vscode.SymbolKind[s.kind]; // Class, Method, Field...
      const range = `[L${s.range.start.line + 1}-${s.range.end.line + 1}]`;
      let line = `${prefix}${kind}: ${s.name} ${range}`;

      if (s.children?.length) {
        line += '\n' + this.formatSymbols(s.children, indent + 1);
      }
      return line;
    }).join('\n');
  }
}
```

#### Tool 2：全局符号搜索（P0）

```typescript
class WorkspaceSymbolTool implements vscode.LanguageModelTool<{ query: string }> {

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ query: string }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {

    // 调用 VS Code 内置命令 → workspace/symbol
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider', options.input.query
    );

    const results = symbols?.map(s => ({
      name: s.name,
      kind: vscode.SymbolKind[s.kind],
      location: `${vscode.workspace.asRelativePath(s.location.uri)}:${s.location.range.start.line + 1}`
    }));

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(results, null, 2))
    ]);
  }
}
```

#### Tool 3：类型查询（P0.5）——Hover 后处理封装

```typescript
class TypeQueryTool implements vscode.LanguageModelTool<{ uri: string; line: number; character: number }> {

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ uri: string; line: number; character: number }>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {

    const uri = vscode.Uri.parse(options.input.uri);
    const position = new vscode.Position(options.input.line, options.input.character);

    // 调用 hover → textDocument/hover
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider', uri, position
    );

    // 关键后处理：从 Markdown 中提取类型签名，去掉 Javadoc 噪音
    const typeInfo = this.extractTypeSignature(hovers);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(typeInfo)
    ]);
  }

  private extractTypeSignature(hovers: vscode.Hover[] | undefined): string {
    if (!hovers?.length) return 'No type information available';

    for (const hover of hovers) {
      for (const content of hover.contents) {
        if (content instanceof vscode.MarkdownString) {
          // jdtls 的 hover 返回格式通常是：
          // ```java\nType signature\n```\n\nJavadoc...
          // 只提取第一个 code block
          const match = content.value.match(/```java\n([\s\S]*?)```/);
          if (match) return match[1].trim();
        }
      }
    }
    return 'Type extraction failed';
  }
}
```

### Tool 元数据声明（package.json）

`modelDescription` 是最重要的字段——LLM 根据这个描述决定什么时候调用 tool：

```jsonc
{
  "contributes": {
    "languageModelTools": [
      {
        "name": "java_fileStructure",
        "displayName": "Java File Structure",
        "modelDescription": "Get the structure (classes, methods, fields) of a Java file without reading its full content. Returns a tree of symbols with their types, names and line ranges. Use this before read_file to understand a file's organization.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "uri": { "type": "string", "description": "The file URI to get structure for" }
          },
          "required": ["uri"]
        }
      },
      {
        "name": "lsp_java_findSymbol",
        "displayName": "Find Symbol in Workspace",
        "modelDescription": "Search for a class, interface, method or field by name across the entire workspace. Returns exact matches with kind (Class/Interface/Method) and file location. More precise than grep - no noise from comments or imports.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "Symbol name or partial name to search for" }
          },
          "required": ["query"]
        }
      },
      {
        "name": "java_getType",
        "displayName": "Get Type at Position",
        "modelDescription": "Get the compiler-resolved type of a symbol at a specific position in a Java file. Returns the precise type including generics (e.g. Map<String, List<Order>>). Use this for var declarations, lambda parameters, or complex generic chains where the type is not visible in source code.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "uri": { "type": "string", "description": "The file URI" },
            "line": { "type": "number", "description": "0-based line number" },
            "character": { "type": "number", "description": "0-based column number" }
          },
          "required": ["uri", "line", "character"]
        }
      }
    ]
  }
}
```

### 关键设计原则

#### 1. `modelDescription` 比实现逻辑更重要

```
❌ "Gets document symbols from LSP"           — LLM 不知道什么时候该用
✅ "Get the structure of a Java file without   — LLM 明确知道：需要了解文件结构时，
    reading its full content"                    用这个替代 read_file
```

#### 2. 返回格式要为 AI 优化，不是为人优化

| 做法 | AI 消耗 tokens |
|------|---------------|
| 原始 hover Markdown（含完整 Javadoc） | ~200 tokens |
| 后处理只保留类型签名 | ~10 tokens |
| 原始 documentSymbol JSON | ~500 tokens |
| 格式化为缩进文本树 | ~100 tokens |

#### 3. 选择 LanguageModelTool 而非其他路径的原因

- **vs 路径 B**（直接用 `run_vscode_command`）：可以快速 PoC，但 AI 不会主动发现这些命令，需要人工提示，无法规模化
- **vs 路径 C**（MCP Server）：需要独立进程管理 jdtls 连接，复杂度高很多，除非目标是脱离 VS Code 的场景

**总结：用 LanguageModelTool API 封装 VS Code 内置命令，是目前最轻量、最正式的方式。实现工作量主要在 tool 的输入输出设计，而不是 LSP 通信。**
