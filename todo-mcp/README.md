# z-mcp todo server

支持“执行计划 -> 主任务 -> 子任务”结构的 MCP 待办服务（SQLite 存储）。

## 功能

- `create_plan` / `update_plan` / `archive_plan` / `delete_plan` / `get_plan` / `list_plans`
- `create_task` / `update_task` / `complete_task` / `delete_task` / `get_task` / `list_tasks` / `reorder_task`
- `batch_create_tasks` / `batch_update_tasks` / `batch_complete_tasks` / `batch_delete_tasks`
- `create_subtask` / `update_subtask` / `complete_subtask` / `delete_subtask` / `get_subtask` / `list_subtasks` / `reorder_subtask`
- `batch_create_subtasks` / `batch_update_subtasks` / `batch_complete_subtasks` / `batch_delete_subtasks`
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

## 批量操作规则

- 全事务回滚：任一 item 校验失败则整体回滚
- 单次上限：items / ids 数组最多 50 条
- 不支持重复 ID：`task_ids` / `subtask_ids` 或更新列表中的 `task_id` / `subtask_id` 不可重复
- 不支持空更新项：`batch_update_tasks` / `batch_update_subtasks` 每个 item 必须至少包含一个更新字段
- 不支持部分成功：失败即整批失败，不会返回部分成功结果
- 成功返回格式：`{ success_count, items }`
- 失败返回格式：统一错误对象，`details` 中按可用性包含 `item_index` 与 `item_id`

## 示例

批量创建任务：

```json
{
  "tool": "batch_create_tasks",
  "arguments": {
    "plan_id": "<plan-id>",
    "items": [
      { "title": "任务 A", "priority": 1 },
      { "title": "任务 B", "note": "备注" }
    ]
  }
}
```

批量完成子任务：

```json
{
  "tool": "batch_complete_subtasks",
  "arguments": {
    "subtask_ids": ["<id-1>", "<id-2>"],
    "done": true
  }
}
```

批量成功响应示例：

```json
{
  "code": 0,
  "data": {
    "success_count": 2,
    "items": [{ "id": "<id-1>" }, { "id": "<id-2>" }]
  },
  "request_meta": {
    "tool": "batch_complete_subtasks",
    "generated_at": "2026-04-28T00:00:00.000Z"
  }
}
```

批量失败响应示例（重复 ID）：

```json
{
  "code": "invalid_input",
  "message": "task_id cannot contain duplicates",
  "details": {
    "item_index": 1,
    "item_id": "<duplicate-task-id>"
  }
}
```

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
