# z-mcp todo server

支持“执行计划 -> 主任务 -> 子任务”结构的 MCP 待办服务（SQLite 存储）。

## 功能

- `create_plan` / `update_plan` / `archive_plan` / `delete_plan` / `get_plan` / `list_plans`
- `create_task` / `update_task` / `complete_task` / `delete_task` / `get_task` / `list_tasks` / `reorder_task`
- `create_subtask` / `update_subtask` / `complete_subtask` / `delete_subtask` / `get_subtask` / `list_subtasks` / `reorder_subtask`
- `get_plan_tree`：查询计划树
- `get_plan_progress`：查询计划进度汇总

## 环境变量

必填：

- `TODO_MCP_DB_FILE`：SQLite 文件绝对路径

## 安装

```bash
npm install
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## MCP 配置示例

```json
{
  "mcpServers": {
    "todo": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/todo-mcp/dist/index.js"],
      "env": {
        "TODO_MCP_DB_FILE": "/absolute/path/to/todo.db"
      }
    }
  }
}
```

## 核心规则

- 默认优先级：`priority=5`
- 优先级排序：数字越小优先级越高
- 默认排序：`priority ASC -> due_date ASC -> order_index ASC -> created_at ASC`
- 删除策略：软删除（`deleted_at`）
- 状态联动：子任务驱动父任务状态
  - 所有子任务完成 -> 父任务自动 `done`
  - 存在未完成子任务 -> 父任务自动 `todo`

## 示例

创建计划：

```json
{
  "tool": "create_plan",
  "arguments": {
    "title": "todo-mcp 优化执行计划",
    "description": "重构存储与接口"
  }
}
```

查询计划树：

```json
{
  "tool": "get_plan_tree",
  "arguments": {
    "plan_id": "<plan-id>"
  }
}
```
