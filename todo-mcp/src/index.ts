import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { TodoService } from "./service.js";
import { TodoStore } from "./store.js";
import { AppError, type ToolResult } from "./types.js";

const config = loadConfig();
const store = new TodoStore(config.dbFile);
const service = new TodoService(store);

const server = new McpServer({
  name: "todo-mcp",
  version: "0.2.0"
});

function toToolResult<T>(tool: string, data: T): { content: Array<{ type: "text"; text: string }> } {
  const body: ToolResult<T> = {
    code: 0,
    data,
    request_meta: {
      tool,
      generated_at: new Date().toISOString()
    }
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(body, null, 2)
      }
    ]
  };
}

function toBatchResult<T>(tool: string, items: T[]): { content: Array<{ type: "text"; text: string }> } {
  return toToolResult(tool, {
    success_count: items.length,
    items
  });
}

function toToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  if (error instanceof AppError) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              code: error.code,
              message: error.message,
              ...(error.details ? { details: error.details } : {})
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            code: "internal_error",
            message
          },
          null,
          2
        )
      }
    ],
    isError: true
  };
}

server.tool(
  "create_plan",
  "创建执行计划。",
  {
    title: z.string().trim().min(1).describe("计划标题"),
    description: z.string().optional().describe("计划描述")
  },
  async ({ title, description }) => {
    try {
      const plan = await service.createPlan({ title, description });
      return toToolResult("create_plan", plan);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "update_plan",
  "更新执行计划。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    title: z.string().trim().min(1).optional().describe("计划标题"),
    description: z.string().optional().describe("计划描述，传空字符串可清空"),
    status: z.enum(["active", "archived"]).optional().describe("计划状态")
  },
  async ({ plan_id, title, description, status }) => {
    try {
      const plan = await service.updatePlan(plan_id, { title, description, status });
      return toToolResult("update_plan", plan);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "archive_plan",
  "归档或取消归档计划。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    archived: z.boolean().optional().describe("是否归档，默认 true")
  },
  async ({ plan_id, archived }) => {
    try {
      const plan = await service.updatePlan(plan_id, { status: archived ?? true ? "archived" : "active" });
      return toToolResult("archive_plan", plan);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "delete_plan",
  "软删除计划及其任务。",
  {
    plan_id: z.string().min(1).describe("计划 ID")
  },
  async ({ plan_id }) => {
    try {
      const plan = await service.deletePlan(plan_id);
      return toToolResult("delete_plan", plan);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "get_plan",
  "查询单个计划。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    include_deleted: z.boolean().optional().describe("是否包含已删除，默认 false")
  },
  async ({ plan_id, include_deleted }) => {
    try {
      const plan = await service.getPlan(plan_id, include_deleted ?? false);
      return toToolResult("get_plan", plan);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "list_plans",
  "列出计划。",
  {
    status: z.enum(["active", "archived"]).optional().describe("状态筛选"),
    include_deleted: z.boolean().optional().describe("是否包含已删除，默认 false"),
    limit: z.number().int().min(1).max(200).optional().describe("分页大小，默认 50"),
    offset: z.number().int().min(0).optional().describe("分页偏移，默认 0")
  },
  async ({ status, include_deleted, limit, offset }) => {
    try {
      const result = await service.listPlans({ status, include_deleted, limit, offset });
      return toToolResult("list_plans", result);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "create_task",
  "创建主任务。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    title: z.string().trim().min(1).describe("任务标题"),
    note: z.string().optional().describe("任务备注"),
    priority: z.number().int().min(1).optional().describe("优先级数字，越小越高，默认 5"),
    due_date: z.string().optional().describe("截止时间，ISO 8601")
  },
  async ({ plan_id, title, note, priority, due_date }) => {
    try {
      const task = await service.createTask({ plan_id, title, note, priority, due_date });
      return toToolResult("create_task", task);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "batch_create_tasks",
  "在同一计划下批量创建主任务。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1).describe("任务标题"),
          note: z.string().optional().describe("任务备注"),
          priority: z.number().int().min(1).optional().describe("优先级数字，越小越高，默认 5"),
          due_date: z.string().optional().describe("截止时间，ISO 8601")
        })
      )
      .min(1)
      .max(50)
      .describe("任务列表，最多 50 条")
  },
  async ({ plan_id, items }) => {
    try {
      const tasks = await service.batchCreateTasks(plan_id, items);
      return toBatchResult("batch_create_tasks", tasks);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "update_task",
  "更新主任务。",
  {
    task_id: z.string().min(1).describe("任务 ID"),
    title: z.string().trim().min(1).optional().describe("任务标题"),
    note: z.string().optional().describe("任务备注，传空字符串可清空"),
    priority: z.number().int().min(1).optional().describe("优先级数字，越小越高"),
    due_date: z.string().optional().describe("截止时间，传空字符串可清空")
  },
  async ({ task_id, title, note, priority, due_date }) => {
    try {
      const task = await service.updateTask(task_id, { title, note, priority, due_date });
      return toToolResult("update_task", task);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "batch_update_tasks",
  "批量更新主任务。",
  {
    items: z
      .array(
        z.object({
          task_id: z.string().min(1).describe("任务 ID"),
          title: z.string().trim().min(1).optional().describe("任务标题"),
          note: z.string().optional().describe("任务备注，传空字符串可清空"),
          priority: z.number().int().min(1).optional().describe("优先级数字，越小越高"),
          due_date: z.string().optional().describe("截止时间，传空字符串可清空")
        })
      )
      .min(1)
      .max(50)
      .describe("更新列表，最多 50 条")
  },
  async ({ items }) => {
    try {
      const tasks = await service.batchUpdateTasks(items);
      return toBatchResult("batch_update_tasks", tasks);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "complete_task",
  "完成或取消完成主任务（有子任务时不允许手动完成）。",
  {
    task_id: z.string().min(1).describe("任务 ID"),
    done: z.boolean().optional().describe("是否完成，默认 true")
  },
  async ({ task_id, done }) => {
    try {
      const task = await service.completeTask(task_id, done ?? true);
      return toToolResult("complete_task", task);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "batch_complete_tasks",
  "批量完成或取消完成主任务（有子任务的任务不允许手动完成）。",
  {
    task_ids: z.array(z.string().min(1)).min(1).max(50).describe("任务 ID 列表，最多 50 条"),
    done: z.boolean().optional().describe("是否完成，默认 true")
  },
  async ({ task_ids, done }) => {
    try {
      const tasks = await service.batchCompleteTasks(task_ids, done ?? true);
      return toBatchResult("batch_complete_tasks", tasks);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "delete_task",
  "软删除主任务及其子任务。",
  {
    task_id: z.string().min(1).describe("任务 ID")
  },
  async ({ task_id }) => {
    try {
      const task = await service.deleteTask(task_id);
      return toToolResult("delete_task", task);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "batch_delete_tasks",
  "批量软删除主任务及其子任务。",
  {
    task_ids: z.array(z.string().min(1)).min(1).max(50).describe("任务 ID 列表，最多 50 条")
  },
  async ({ task_ids }) => {
    try {
      const tasks = await service.batchDeleteTasks(task_ids);
      return toBatchResult("batch_delete_tasks", tasks);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "get_task",
  "查询主任务。",
  {
    task_id: z.string().min(1).describe("任务 ID"),
    include_deleted: z.boolean().optional().describe("是否包含已删除，默认 false")
  },
  async ({ task_id, include_deleted }) => {
    try {
      const task = await service.getTask(task_id, include_deleted ?? false);
      return toToolResult("get_task", task);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "list_tasks",
  "列出某计划下主任务。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    status: z.enum(["todo", "done"]).optional().describe("状态筛选"),
    include_deleted: z.boolean().optional().describe("是否包含已删除，默认 false"),
    limit: z.number().int().min(1).max(200).optional().describe("分页大小，默认 50"),
    offset: z.number().int().min(0).optional().describe("分页偏移，默认 0")
  },
  async ({ plan_id, status, include_deleted, limit, offset }) => {
    try {
      const result = await service.listTasks({ plan_id, status, include_deleted, limit, offset });
      return toToolResult("list_tasks", result);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "reorder_task",
  "重排计划下主任务顺序。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    task_ids: z.array(z.string().min(1)).min(1).describe("按新顺序排列的全部 task_id")
  },
  async ({ plan_id, task_ids }) => {
    try {
      const result = await service.reorderTask(plan_id, task_ids);
      return toToolResult("reorder_task", result);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "create_subtask",
  "创建子任务。",
  {
    task_id: z.string().min(1).describe("父任务 ID"),
    title: z.string().trim().min(1).describe("子任务标题"),
    note: z.string().optional().describe("子任务备注"),
    priority: z.number().int().min(1).optional().describe("优先级数字，越小越高，默认 5"),
    due_date: z.string().optional().describe("截止时间，ISO 8601")
  },
  async ({ task_id, title, note, priority, due_date }) => {
    try {
      const subtask = await service.createSubtask({ task_id, title, note, priority, due_date });
      return toToolResult("create_subtask", subtask);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "batch_create_subtasks",
  "在同一任务下批量创建子任务。",
  {
    task_id: z.string().min(1).describe("父任务 ID"),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1).describe("子任务标题"),
          note: z.string().optional().describe("子任务备注"),
          priority: z.number().int().min(1).optional().describe("优先级数字，越小越高，默认 5"),
          due_date: z.string().optional().describe("截止时间，ISO 8601")
        })
      )
      .min(1)
      .max(50)
      .describe("子任务列表，最多 50 条")
  },
  async ({ task_id, items }) => {
    try {
      const subtasks = await service.batchCreateSubtasks(task_id, items);
      return toBatchResult("batch_create_subtasks", subtasks);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "update_subtask",
  "更新子任务。",
  {
    subtask_id: z.string().min(1).describe("子任务 ID"),
    title: z.string().trim().min(1).optional().describe("子任务标题"),
    note: z.string().optional().describe("子任务备注，传空字符串可清空"),
    priority: z.number().int().min(1).optional().describe("优先级数字，越小越高"),
    due_date: z.string().optional().describe("截止时间，传空字符串可清空")
  },
  async ({ subtask_id, title, note, priority, due_date }) => {
    try {
      const subtask = await service.updateSubtask(subtask_id, { title, note, priority, due_date });
      return toToolResult("update_subtask", subtask);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "batch_update_subtasks",
  "批量更新子任务。",
  {
    items: z
      .array(
        z.object({
          subtask_id: z.string().min(1).describe("子任务 ID"),
          title: z.string().trim().min(1).optional().describe("子任务标题"),
          note: z.string().optional().describe("子任务备注，传空字符串可清空"),
          priority: z.number().int().min(1).optional().describe("优先级数字，越小越高"),
          due_date: z.string().optional().describe("截止时间，传空字符串可清空")
        })
      )
      .min(1)
      .max(50)
      .describe("更新列表，最多 50 条")
  },
  async ({ items }) => {
    try {
      const subtasks = await service.batchUpdateSubtasks(items);
      return toBatchResult("batch_update_subtasks", subtasks);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "complete_subtask",
  "完成或取消完成子任务（会自动更新父任务状态）。",
  {
    subtask_id: z.string().min(1).describe("子任务 ID"),
    done: z.boolean().optional().describe("是否完成，默认 true")
  },
  async ({ subtask_id, done }) => {
    try {
      const subtask = await service.completeSubtask(subtask_id, done ?? true);
      return toToolResult("complete_subtask", subtask);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "batch_complete_subtasks",
  "批量完成或取消完成子任务（会自动更新父任务状态）。",
  {
    subtask_ids: z.array(z.string().min(1)).min(1).max(50).describe("子任务 ID 列表，最多 50 条"),
    done: z.boolean().optional().describe("是否完成，默认 true")
  },
  async ({ subtask_ids, done }) => {
    try {
      const subtasks = await service.batchCompleteSubtasks(subtask_ids, done ?? true);
      return toBatchResult("batch_complete_subtasks", subtasks);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "delete_subtask",
  "软删除子任务。",
  {
    subtask_id: z.string().min(1).describe("子任务 ID")
  },
  async ({ subtask_id }) => {
    try {
      const subtask = await service.deleteSubtask(subtask_id);
      return toToolResult("delete_subtask", subtask);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "batch_delete_subtasks",
  "批量软删除子任务（会自动更新父任务状态）。",
  {
    subtask_ids: z.array(z.string().min(1)).min(1).max(50).describe("子任务 ID 列表，最多 50 条")
  },
  async ({ subtask_ids }) => {
    try {
      const subtasks = await service.batchDeleteSubtasks(subtask_ids);
      return toBatchResult("batch_delete_subtasks", subtasks);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "get_subtask",
  "查询子任务。",
  {
    subtask_id: z.string().min(1).describe("子任务 ID"),
    include_deleted: z.boolean().optional().describe("是否包含已删除，默认 false")
  },
  async ({ subtask_id, include_deleted }) => {
    try {
      const subtask = await service.getSubtask(subtask_id, include_deleted ?? false);
      return toToolResult("get_subtask", subtask);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "list_subtasks",
  "列出某主任务下子任务。",
  {
    task_id: z.string().min(1).describe("父任务 ID"),
    status: z.enum(["todo", "done"]).optional().describe("状态筛选"),
    include_deleted: z.boolean().optional().describe("是否包含已删除，默认 false"),
    limit: z.number().int().min(1).max(200).optional().describe("分页大小，默认 50"),
    offset: z.number().int().min(0).optional().describe("分页偏移，默认 0")
  },
  async ({ task_id, status, include_deleted, limit, offset }) => {
    try {
      const result = await service.listSubtasks({ task_id, status, include_deleted, limit, offset });
      return toToolResult("list_subtasks", result);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "reorder_subtask",
  "重排主任务下子任务顺序。",
  {
    task_id: z.string().min(1).describe("父任务 ID"),
    subtask_ids: z.array(z.string().min(1)).min(1).describe("按新顺序排列的全部 subtask_id")
  },
  async ({ task_id, subtask_ids }) => {
    try {
      const result = await service.reorderSubtask(task_id, subtask_ids);
      return toToolResult("reorder_subtask", result);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "get_plan_tree",
  "查询计划树（计划->主任务->子任务）。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    include_deleted: z.boolean().optional().describe("是否包含已删除，默认 false")
  },
  async ({ plan_id, include_deleted }) => {
    try {
      const tree = await service.getPlanTree(plan_id, include_deleted ?? false);
      return toToolResult("get_plan_tree", tree);
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "get_plan_progress",
  "查询计划进度汇总。",
  {
    plan_id: z.string().min(1).describe("计划 ID"),
    include_deleted: z.boolean().optional().describe("是否包含已删除，默认 false")
  },
  async ({ plan_id, include_deleted }) => {
    try {
      const summary = await service.getPlanProgress(plan_id, include_deleted ?? false);
      return toToolResult("get_plan_progress", summary);
    } catch (error) {
      return toToolError(error);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
