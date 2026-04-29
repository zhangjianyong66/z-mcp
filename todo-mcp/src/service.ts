import { randomUUID } from "node:crypto";
import type { Database } from "sqlite";
import {
  AppError,
  type ListPlansInput,
  type ListSubtasksInput,
  type ListTasksInput,
  type Plan,
  type PlanStatus,
  type PlanTree,
  type PlanTreeTask,
  type SubTask,
  type Task,
  type TaskStatus,
  type UpdatePlanInput,
  type UpdateSubtaskInput,
  type UpdateTaskInput
} from "./types.js";
import { TodoStore } from "./store.js";

export class TodoService {
  constructor(private readonly store: TodoStore) {}

  async createPlan(input: { title: string; description?: string }): Promise<Plan> {
    const title = normalizeTitle(input.title);
    const description = normalizeOptionalText(input.description);
    const now = nowIso();
    const plan: Plan = {
      id: randomUUID(),
      title,
      ...(description ? { description } : {}),
      status: "active",
      created_at: now,
      updated_at: now
    };

    await this.store.run(
      `INSERT INTO plans (id, title, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [plan.id, plan.title, plan.description ?? null, plan.status, plan.created_at, plan.updated_at]
    );

    return plan;
  }

  async updatePlan(planId: string, input: UpdatePlanInput): Promise<Plan> {
    const before = await this.getPlan(planId, true);
    if (before.deleted_at) {
      throw new AppError("not_found", `plan not found: ${planId}`);
    }

    const hasTitle = input.title !== undefined;
    const hasDescription = input.description !== undefined;
    const hasStatus = input.status !== undefined;

    if (!hasTitle && !hasDescription && !hasStatus) {
      throw new AppError("invalid_input", "No update fields provided");
    }

    const next: Plan = {
      ...before,
      ...(hasTitle ? { title: normalizeTitle(input.title as string) } : {}),
      ...(hasDescription ? { description: normalizeOptionalText(input.description) } : {}),
      ...(hasStatus ? { status: input.status as PlanStatus } : {}),
      updated_at: nowIso()
    };

    await this.store.run(
      `UPDATE plans
       SET title = ?, description = ?, status = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [next.title, next.description ?? null, next.status, next.updated_at, planId]
    );

    return next;
  }

  async deletePlan(planId: string): Promise<Plan> {
    const plan = await this.getPlan(planId, false);
    const now = nowIso();

    await this.store.withTransaction(async (db) => {
      await db.run(`UPDATE plans SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, now, now, planId);
      await db.run(`UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE plan_id = ? AND deleted_at IS NULL`, now, now, planId);
      await db.run(
        `UPDATE subtasks
         SET deleted_at = ?, updated_at = ?
         WHERE task_id IN (SELECT id FROM tasks WHERE plan_id = ?) AND deleted_at IS NULL`,
        now,
        now,
        planId
      );
    });

    return {
      ...plan,
      deleted_at: now,
      updated_at: now
    };
  }

  async getPlan(planId: string, includeDeleted = false): Promise<Plan> {
    const row = await this.store.get<Plan>(
      `SELECT id, title, description, status, created_at, updated_at, deleted_at
       FROM plans
       WHERE id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
      [planId]
    );

    if (!row) {
      throw new AppError("not_found", `plan not found: ${planId}`);
    }

    return stripNullable(row);
  }

  async listPlans(input: ListPlansInput): Promise<{ total: number; items: Plan[] }> {
    const includeDeleted = input.include_deleted ?? false;
    const clauses = [includeDeleted ? "1=1" : "deleted_at IS NULL"];
    const params: Array<string | number | null> = [];

    if (input.status) {
      clauses.push("status = ?");
      params.push(input.status);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const totalRow = await this.store.get<{ total: number }>(`SELECT COUNT(1) as total FROM plans ${where}`, params);

    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    const rows = await this.store.all<Plan>(
      `SELECT id, title, description, status, created_at, updated_at, deleted_at
       FROM plans
       ${where}
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      total: totalRow?.total ?? 0,
      items: rows.map(stripNullable)
    };
  }

  async createTask(input: {
    plan_id: string;
    title: string;
    note?: string;
    priority?: number;
    due_date?: string;
  }): Promise<Task> {
    await this.getPlan(input.plan_id, false);

    const title = normalizeTitle(input.title);
    const note = normalizeOptionalText(input.note);
    const priority = normalizePriority(input.priority);
    const dueDate = normalizeOptionalDate(input.due_date, "due_date");

    return this.store.withTransaction(async (db) => {
      const row = await db.get<{ max_order: number | null }>(
        `SELECT MAX(order_index) as max_order FROM tasks WHERE plan_id = ? AND deleted_at IS NULL`,
        input.plan_id
      );
      const now = nowIso();
      const task: Task = {
        id: randomUUID(),
        plan_id: input.plan_id,
        title,
        ...(note ? { note } : {}),
        priority,
        status: "todo",
        ...(dueDate ? { due_date: dueDate } : {}),
        order_index: (row?.max_order ?? 0) + 1,
        created_at: now,
        updated_at: now
      };

      await db.run(
        `INSERT INTO tasks
        (id, plan_id, title, note, priority, status, due_date, order_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        task.id,
        task.plan_id,
        task.title,
        task.note ?? null,
        task.priority,
        task.status,
        task.due_date ?? null,
        task.order_index,
        task.created_at,
        task.updated_at
      );

      return task;
    });
  }

  async batchCreateTasks(
    planId: string,
    items: Array<{ title: string; note?: string; priority?: number; due_date?: string }>
  ): Promise<Task[]> {
    await this.getPlan(planId, false);

    return this.store.withTransaction(async (db) => {
      const row = await db.get<{ max_order: number | null }>(
        `SELECT MAX(order_index) as max_order FROM tasks WHERE plan_id = ? AND deleted_at IS NULL`,
        planId
      );
      let nextOrder = (row?.max_order ?? 0) + 1;
      const now = nowIso();
      const tasks: Task[] = [];

      for (const item of items) {
        const title = normalizeTitle(item.title);
        const note = normalizeOptionalText(item.note);
        const priority = normalizePriority(item.priority);
        const dueDate = normalizeOptionalDate(item.due_date, "due_date");

        const task: Task = {
          id: randomUUID(),
          plan_id: planId,
          title,
          ...(note ? { note } : {}),
          priority,
          status: "todo",
          ...(dueDate ? { due_date: dueDate } : {}),
          order_index: nextOrder++,
          created_at: now,
          updated_at: now
        };

        await db.run(
          `INSERT INTO tasks
          (id, plan_id, title, note, priority, status, due_date, order_index, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          task.id,
          task.plan_id,
          task.title,
          task.note ?? null,
          task.priority,
          task.status,
          task.due_date ?? null,
          task.order_index,
          task.created_at,
          task.updated_at
        );

        tasks.push(task);
      }

      return tasks;
    });
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    const before = await this.getTask(taskId, false);
    const hasTitle = input.title !== undefined;
    const hasNote = input.note !== undefined;
    const hasPriority = input.priority !== undefined;
    const hasDueDate = input.due_date !== undefined;

    if (!hasTitle && !hasNote && !hasPriority && !hasDueDate) {
      throw new AppError("invalid_input", "No update fields provided");
    }

    const next: Task = {
      ...before,
      ...(hasTitle ? { title: normalizeTitle(input.title as string) } : {}),
      ...(hasNote ? { note: normalizeOptionalText(input.note) } : {}),
      ...(hasPriority ? { priority: normalizePriority(input.priority) } : {}),
      ...(hasDueDate ? { due_date: normalizeOptionalDate(input.due_date, "due_date") } : {}),
      updated_at: nowIso()
    };

    await this.store.run(
      `UPDATE tasks
       SET title = ?, note = ?, priority = ?, due_date = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [next.title, next.note ?? null, next.priority, next.due_date ?? null, next.updated_at, taskId]
    );

    return next;
  }

  async batchUpdateTasks(
    items: Array<{ task_id: string } & UpdateTaskInput>
  ): Promise<Task[]> {
    const idContext = buildIdIndexContext(items.map((item) => item.task_id));
    for (const [index, item] of items.entries()) {
      assertHasUpdateFields(item, index, "task_id");
    }

    return this.store.withTransaction(async (db) => {
      await assertTasksExist(db, idContext);
      const tasks: Task[] = [];

      for (const item of items) {
        const before = await this.getTask(item.task_id, false);
        const hasTitle = item.title !== undefined;
        const hasNote = item.note !== undefined;
        const hasPriority = item.priority !== undefined;
        const hasDueDate = item.due_date !== undefined;

        const next: Task = {
          ...before,
          ...(hasTitle ? { title: normalizeTitle(item.title as string) } : {}),
          ...(hasNote ? { note: normalizeOptionalText(item.note) } : {}),
          ...(hasPriority ? { priority: normalizePriority(item.priority) } : {}),
          ...(hasDueDate ? { due_date: normalizeOptionalDate(item.due_date, "due_date") } : {}),
          updated_at: nowIso()
        };

        await db.run(
          `UPDATE tasks
           SET title = ?, note = ?, priority = ?, due_date = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          next.title,
          next.note ?? null,
          next.priority,
          next.due_date ?? null,
          next.updated_at,
          item.task_id
        );

        tasks.push(next);
      }

      return tasks;
    });
  }

  async completeTask(taskId: string, done = true): Promise<Task> {
    const task = await this.getTask(taskId, false);

    const subtaskCount = await this.store.get<{ total: number }>(
      `SELECT COUNT(1) as total FROM subtasks WHERE task_id = ? AND deleted_at IS NULL`,
      [taskId]
    );

    if ((subtaskCount?.total ?? 0) > 0) {
      throw new AppError("invalid_input", "task status is derived from subtasks");
    }

    const now = nowIso();
    const next: Task = {
      ...task,
      status: done ? "done" : "todo",
      completed_at: done ? now : undefined,
      updated_at: now
    };

    await this.store.run(
      `UPDATE tasks
       SET status = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [next.status, next.completed_at ?? null, next.updated_at, taskId]
    );

    return next;
  }

  async batchCompleteTasks(taskIds: string[], done = true): Promise<Task[]> {
    const idContext = buildIdIndexContext(taskIds);

    return this.store.withTransaction(async (db) => {
      await assertTasksExist(db, idContext);
      await assertTasksCanBeManuallyCompleted(db, idContext);
      const tasks: Task[] = [];

      for (const taskId of taskIds) {
        const task = await this.getTask(taskId, false);

        const now = nowIso();
        const next: Task = {
          ...task,
          status: done ? "done" : "todo",
          completed_at: done ? now : undefined,
          updated_at: now
        };

        await db.run(
          `UPDATE tasks
           SET status = ?, completed_at = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          next.status,
          next.completed_at ?? null,
          next.updated_at,
          taskId
        );

        tasks.push(next);
      }

      return tasks;
    });
  }

  async deleteTask(taskId: string): Promise<Task> {
    const task = await this.getTask(taskId, false);
    const now = nowIso();

    await this.store.withTransaction(async (db) => {
      await db.run(`UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, now, now, taskId);
      await db.run(`UPDATE subtasks SET deleted_at = ?, updated_at = ? WHERE task_id = ? AND deleted_at IS NULL`, now, now, taskId);
    });

    return {
      ...task,
      deleted_at: now,
      updated_at: now
    };
  }

  async batchDeleteTasks(taskIds: string[]): Promise<Task[]> {
    const idContext = buildIdIndexContext(taskIds);

    return this.store.withTransaction(async (db) => {
      await assertTasksExist(db, idContext);
      const tasks: Task[] = [];
      const now = nowIso();

      for (const taskId of taskIds) {
        const task = await this.getTask(taskId, false);

        await db.run(
          `UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
          now,
          now,
          taskId
        );
        await db.run(
          `UPDATE subtasks SET deleted_at = ?, updated_at = ? WHERE task_id = ? AND deleted_at IS NULL`,
          now,
          now,
          taskId
        );

        tasks.push({ ...task, deleted_at: now, updated_at: now });
      }

      return tasks;
    });
  }

  async getTask(taskId: string, includeDeleted = false): Promise<Task> {
    const row = await this.store.get<Task>(
      `SELECT id, plan_id, title, note, priority, status, due_date, order_index, created_at, updated_at, completed_at, deleted_at
       FROM tasks
       WHERE id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
      [taskId]
    );

    if (!row) {
      throw new AppError("not_found", `task not found: ${taskId}`);
    }
    return stripNullable(row);
  }

  async listTasks(input: ListTasksInput): Promise<{ total: number; items: Task[] }> {
    await this.getPlan(input.plan_id, false);
    const includeDeleted = input.include_deleted ?? false;

    const clauses = ["plan_id = ?", includeDeleted ? "1=1" : "deleted_at IS NULL"];
    const params: Array<string | number | null> = [input.plan_id];

    if (input.status) {
      clauses.push("status = ?");
      params.push(input.status);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const totalRow = await this.store.get<{ total: number }>(`SELECT COUNT(1) as total FROM tasks ${where}`, params);

    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    const rows = await this.store.all<Task>(
      `SELECT id, plan_id, title, note, priority, status, due_date, order_index, created_at, updated_at, completed_at, deleted_at
       FROM tasks
       ${where}
       ORDER BY priority ASC,
                CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
                due_date ASC,
                order_index ASC,
                created_at ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      total: totalRow?.total ?? 0,
      items: rows.map(stripNullable)
    };
  }

  async reorderTask(planId: string, taskIds: string[]): Promise<{ ordered_ids: string[] }> {
    await this.getPlan(planId, false);
    validateReorderIds(taskIds, "task_ids");

    await this.store.withTransaction(async (db) => {
      const rows = await db.all<{ id: string }[]>(
        `SELECT id FROM tasks WHERE plan_id = ? AND deleted_at IS NULL ORDER BY order_index ASC`,
        planId
      );
      const existing = rows.map((item) => item.id);
      assertReorderMatch(existing, taskIds, "task_ids");

      for (let i = 0; i < taskIds.length; i += 1) {
        await db.run(`UPDATE tasks SET order_index = ?, updated_at = ? WHERE id = ?`, i + 1, nowIso(), taskIds[i]);
      }
    });

    return { ordered_ids: taskIds };
  }

  async createSubtask(input: {
    task_id: string;
    title: string;
    note?: string;
    priority?: number;
    due_date?: string;
  }): Promise<SubTask> {
    await this.getTask(input.task_id, false);

    const title = normalizeTitle(input.title);
    const note = normalizeOptionalText(input.note);
    const priority = normalizePriority(input.priority);
    const dueDate = normalizeOptionalDate(input.due_date, "due_date");

    return this.store.withTransaction(async (db) => {
      const row = await db.get<{ max_order: number | null }>(
        `SELECT MAX(order_index) as max_order FROM subtasks WHERE task_id = ? AND deleted_at IS NULL`,
        input.task_id
      );
      const now = nowIso();
      const subtask: SubTask = {
        id: randomUUID(),
        task_id: input.task_id,
        title,
        ...(note ? { note } : {}),
        priority,
        status: "todo",
        ...(dueDate ? { due_date: dueDate } : {}),
        order_index: (row?.max_order ?? 0) + 1,
        created_at: now,
        updated_at: now
      };

      await db.run(
        `INSERT INTO subtasks
        (id, task_id, title, note, priority, status, due_date, order_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        subtask.id,
        subtask.task_id,
        subtask.title,
        subtask.note ?? null,
        subtask.priority,
        subtask.status,
        subtask.due_date ?? null,
        subtask.order_index,
        subtask.created_at,
        subtask.updated_at
      );

      await refreshTaskStatusFromSubtasks(db, input.task_id);
      return subtask;
    });
  }

  async batchCreateSubtasks(
    taskId: string,
    items: Array<{ title: string; note?: string; priority?: number; due_date?: string }>
  ): Promise<SubTask[]> {
    await this.getTask(taskId, false);

    return this.store.withTransaction(async (db) => {
      const row = await db.get<{ max_order: number | null }>(
        `SELECT MAX(order_index) as max_order FROM subtasks WHERE task_id = ? AND deleted_at IS NULL`,
        taskId
      );
      let nextOrder = (row?.max_order ?? 0) + 1;
      const now = nowIso();
      const subtasks: SubTask[] = [];

      for (const item of items) {
        const title = normalizeTitle(item.title);
        const note = normalizeOptionalText(item.note);
        const priority = normalizePriority(item.priority);
        const dueDate = normalizeOptionalDate(item.due_date, "due_date");

        const subtask: SubTask = {
          id: randomUUID(),
          task_id: taskId,
          title,
          ...(note ? { note } : {}),
          priority,
          status: "todo",
          ...(dueDate ? { due_date: dueDate } : {}),
          order_index: nextOrder++,
          created_at: now,
          updated_at: now
        };

        await db.run(
          `INSERT INTO subtasks
          (id, task_id, title, note, priority, status, due_date, order_index, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          subtask.id,
          subtask.task_id,
          subtask.title,
          subtask.note ?? null,
          subtask.priority,
          subtask.status,
          subtask.due_date ?? null,
          subtask.order_index,
          subtask.created_at,
          subtask.updated_at
        );

        subtasks.push(subtask);
      }

      await refreshTaskStatusFromSubtasks(db, taskId);
      return subtasks;
    });
  }

  async updateSubtask(subtaskId: string, input: UpdateSubtaskInput): Promise<SubTask> {
    const before = await this.getSubtask(subtaskId, false);
    const hasTitle = input.title !== undefined;
    const hasNote = input.note !== undefined;
    const hasPriority = input.priority !== undefined;
    const hasDueDate = input.due_date !== undefined;

    if (!hasTitle && !hasNote && !hasPriority && !hasDueDate) {
      throw new AppError("invalid_input", "No update fields provided");
    }

    const next: SubTask = {
      ...before,
      ...(hasTitle ? { title: normalizeTitle(input.title as string) } : {}),
      ...(hasNote ? { note: normalizeOptionalText(input.note) } : {}),
      ...(hasPriority ? { priority: normalizePriority(input.priority) } : {}),
      ...(hasDueDate ? { due_date: normalizeOptionalDate(input.due_date, "due_date") } : {}),
      updated_at: nowIso()
    };

    await this.store.run(
      `UPDATE subtasks
       SET title = ?, note = ?, priority = ?, due_date = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [next.title, next.note ?? null, next.priority, next.due_date ?? null, next.updated_at, subtaskId]
    );

    return next;
  }

  async batchUpdateSubtasks(
    items: Array<{ subtask_id: string } & UpdateSubtaskInput>
  ): Promise<SubTask[]> {
    const idContext = buildIdIndexContext(items.map((item) => item.subtask_id), "subtask_id");
    for (const [index, item] of items.entries()) {
      assertHasUpdateFields(item, index, "subtask_id");
    }

    return this.store.withTransaction(async (db) => {
      await assertSubtasksExist(db, idContext);
      const subtasks: SubTask[] = [];

      for (const item of items) {
        const before = await this.getSubtask(item.subtask_id, false);
        const hasTitle = item.title !== undefined;
        const hasNote = item.note !== undefined;
        const hasPriority = item.priority !== undefined;
        const hasDueDate = item.due_date !== undefined;

        const next: SubTask = {
          ...before,
          ...(hasTitle ? { title: normalizeTitle(item.title as string) } : {}),
          ...(hasNote ? { note: normalizeOptionalText(item.note) } : {}),
          ...(hasPriority ? { priority: normalizePriority(item.priority) } : {}),
          ...(hasDueDate ? { due_date: normalizeOptionalDate(item.due_date, "due_date") } : {}),
          updated_at: nowIso()
        };

        await db.run(
          `UPDATE subtasks
           SET title = ?, note = ?, priority = ?, due_date = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          next.title,
          next.note ?? null,
          next.priority,
          next.due_date ?? null,
          next.updated_at,
          item.subtask_id
        );

        subtasks.push(next);
      }

      return subtasks;
    });
  }

  async completeSubtask(subtaskId: string, done = true): Promise<SubTask> {
    const before = await this.getSubtask(subtaskId, false);

    return this.store.withTransaction(async (db) => {
      const now = nowIso();
      const next: SubTask = {
        ...before,
        status: done ? "done" : "todo",
        completed_at: done ? now : undefined,
        updated_at: now
      };

      await db.run(
        `UPDATE subtasks
         SET status = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        next.status,
        next.completed_at ?? null,
        next.updated_at,
        subtaskId
      );

      await refreshTaskStatusFromSubtasks(db, before.task_id);
      return next;
    });
  }

  async batchCompleteSubtasks(subtaskIds: string[], done = true): Promise<SubTask[]> {
    const idContext = buildIdIndexContext(subtaskIds, "subtask_id");

    return this.store.withTransaction(async (db) => {
      await assertSubtasksExist(db, idContext);
      const subtasks: SubTask[] = [];
      const taskIds = new Set<string>();

      for (const subtaskId of subtaskIds) {
        const before = await this.getSubtask(subtaskId, false);

        const now = nowIso();
        const next: SubTask = {
          ...before,
          status: done ? "done" : "todo",
          completed_at: done ? now : undefined,
          updated_at: now
        };

        await db.run(
          `UPDATE subtasks
           SET status = ?, completed_at = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          next.status,
          next.completed_at ?? null,
          next.updated_at,
          subtaskId
        );

        subtasks.push(next);
        taskIds.add(before.task_id);
      }

      for (const taskId of taskIds) {
        await refreshTaskStatusFromSubtasks(db, taskId);
      }

      return subtasks;
    });
  }

  async deleteSubtask(subtaskId: string): Promise<SubTask> {
    const subtask = await this.getSubtask(subtaskId, false);
    const now = nowIso();

    await this.store.withTransaction(async (db) => {
      await db.run(`UPDATE subtasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, now, now, subtaskId);
      await refreshTaskStatusFromSubtasks(db, subtask.task_id);
    });

    return {
      ...subtask,
      deleted_at: now,
      updated_at: now
    };
  }

  async batchDeleteSubtasks(subtaskIds: string[]): Promise<SubTask[]> {
    const idContext = buildIdIndexContext(subtaskIds, "subtask_id");

    return this.store.withTransaction(async (db) => {
      await assertSubtasksExist(db, idContext);
      const subtasks: SubTask[] = [];
      const taskIds = new Set<string>();
      const now = nowIso();

      for (const subtaskId of subtaskIds) {
        const subtask = await this.getSubtask(subtaskId, false);

        await db.run(
          `UPDATE subtasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
          now,
          now,
          subtaskId
        );

        subtasks.push({ ...subtask, deleted_at: now, updated_at: now });
        taskIds.add(subtask.task_id);
      }

      for (const taskId of taskIds) {
        await refreshTaskStatusFromSubtasks(db, taskId);
      }

      return subtasks;
    });
  }

  async getSubtask(subtaskId: string, includeDeleted = false): Promise<SubTask> {
    const row = await this.store.get<SubTask>(
      `SELECT id, task_id, title, note, priority, status, due_date, order_index, created_at, updated_at, completed_at, deleted_at
       FROM subtasks
       WHERE id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
      [subtaskId]
    );

    if (!row) {
      throw new AppError("not_found", `subtask not found: ${subtaskId}`);
    }
    return stripNullable(row);
  }

  async listSubtasks(input: ListSubtasksInput): Promise<{ total: number; items: SubTask[] }> {
    await this.getTask(input.task_id, false);
    const includeDeleted = input.include_deleted ?? false;

    const clauses = ["task_id = ?", includeDeleted ? "1=1" : "deleted_at IS NULL"];
    const params: Array<string | number | null> = [input.task_id];

    if (input.status) {
      clauses.push("status = ?");
      params.push(input.status);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const totalRow = await this.store.get<{ total: number }>(`SELECT COUNT(1) as total FROM subtasks ${where}`, params);

    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    const rows = await this.store.all<SubTask>(
      `SELECT id, task_id, title, note, priority, status, due_date, order_index, created_at, updated_at, completed_at, deleted_at
       FROM subtasks
       ${where}
       ORDER BY priority ASC,
                CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
                due_date ASC,
                order_index ASC,
                created_at ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      total: totalRow?.total ?? 0,
      items: rows.map(stripNullable)
    };
  }

  async reorderSubtask(taskId: string, subtaskIds: string[]): Promise<{ ordered_ids: string[] }> {
    await this.getTask(taskId, false);
    validateReorderIds(subtaskIds, "subtask_ids");

    await this.store.withTransaction(async (db) => {
      const rows = await db.all<{ id: string }[]>(
        `SELECT id FROM subtasks WHERE task_id = ? AND deleted_at IS NULL ORDER BY order_index ASC`,
        taskId
      );
      const existing = rows.map((item) => item.id);
      assertReorderMatch(existing, subtaskIds, "subtask_ids");

      for (let i = 0; i < subtaskIds.length; i += 1) {
        await db.run(`UPDATE subtasks SET order_index = ?, updated_at = ? WHERE id = ?`, i + 1, nowIso(), subtaskIds[i]);
      }

      await refreshTaskStatusFromSubtasks(db, taskId);
    });

    return { ordered_ids: subtaskIds };
  }

  async getPlanTree(planId: string, includeDeleted = false): Promise<PlanTree> {
    const plan = await this.getPlan(planId, includeDeleted);
    const taskRows = await this.store.all<Task>(
      `SELECT id, plan_id, title, note, priority, status, due_date, order_index, created_at, updated_at, completed_at, deleted_at
       FROM tasks
       WHERE plan_id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}
       ORDER BY priority ASC,
                CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
                due_date ASC,
                order_index ASC,
                created_at ASC`,
      [planId]
    );

    const tasks = taskRows.map(stripNullable);
    const taskIds = tasks.map((item) => item.id);

    let subtasks: SubTask[] = [];
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => "?").join(", ");
      const rows = await this.store.all<SubTask>(
        `SELECT id, task_id, title, note, priority, status, due_date, order_index, created_at, updated_at, completed_at, deleted_at
         FROM subtasks
         WHERE task_id IN (${placeholders}) ${includeDeleted ? "" : "AND deleted_at IS NULL"}
         ORDER BY priority ASC,
                  CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
                  due_date ASC,
                  order_index ASC,
                  created_at ASC`,
        taskIds
      );
      subtasks = rows.map(stripNullable);
    }

    const byTaskId = new Map<string, SubTask[]>();
    for (const subtask of subtasks) {
      const list = byTaskId.get(subtask.task_id) ?? [];
      list.push(subtask);
      byTaskId.set(subtask.task_id, list);
    }

    const treeTasks: PlanTreeTask[] = tasks.map((task) => {
      const children = byTaskId.get(task.id) ?? [];
      const doneSubtasks = children.filter((child) => child.status === "done").length;
      const totalSubtasks = children.length;
      return {
        ...task,
        subtasks: children,
        progress: {
          total_subtasks: totalSubtasks,
          done_subtasks: doneSubtasks,
          completion_rate: totalSubtasks > 0 ? doneSubtasks / totalSubtasks : 0
        }
      };
    });

    const doneTasks = treeTasks.filter((task) => task.status === "done").length;
    const totalSubtasks = subtasks.length;
    const doneSubtasks = subtasks.filter((item) => item.status === "done").length;

    return {
      plan,
      tasks: treeTasks,
      summary: {
        total_tasks: treeTasks.length,
        done_tasks: doneTasks,
        total_subtasks: totalSubtasks,
        done_subtasks: doneSubtasks,
        completion_rate: totalSubtasks > 0 ? doneSubtasks / totalSubtasks : treeTasks.length > 0 ? doneTasks / treeTasks.length : 0
      }
    };
  }

  async getPlanProgress(planId: string, includeDeleted = false): Promise<PlanTree["summary"]> {
    const tree = await this.getPlanTree(planId, includeDeleted);
    return tree.summary;
  }
}

async function refreshTaskStatusFromSubtasks(db: Database, taskId: string): Promise<void> {
  const counts = await db.get<{ total: number; done: number }>(
    `SELECT
        COUNT(1) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
      FROM subtasks
      WHERE task_id = ? AND deleted_at IS NULL`,
    taskId
  );

  const total = counts?.total ?? 0;
  const done = counts?.done ?? 0;
  if (total === 0) {
    return;
  }

  const now = nowIso();
  const nextStatus: TaskStatus = done === total ? "done" : "todo";
  const completedAt = nextStatus === "done" ? now : null;

  await db.run(
    `UPDATE tasks
     SET status = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    nextStatus,
    completedAt,
    now,
    taskId
  );
}

function normalizeTitle(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AppError("invalid_input", "title cannot be empty");
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePriority(value: number | undefined): number {
  if (value === undefined) {
    return 5;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError("invalid_input", "priority must be an integer >= 1");
  }
  return value;
}

function normalizeOptionalDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("invalid_input", `${field} must be a valid date string`);
  }
  return normalized;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stripNullable<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row };
  for (const [key, value] of Object.entries(next)) {
    if (value === null) {
      delete (next as Record<string, unknown>)[key];
    }
  }
  return next;
}

function validateReorderIds(ids: string[], field: string): void {
  if (ids.length === 0) {
    throw new AppError("invalid_input", `${field} cannot be empty`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new AppError("invalid_input", `${field} cannot contain duplicates`);
  }
}

function assertReorderMatch(existingIds: string[], requestedIds: string[], field: string): void {
  if (existingIds.length !== requestedIds.length) {
    throw new AppError("invalid_input", `${field} must include all active items`);
  }
  const existingSet = new Set(existingIds);
  for (const id of requestedIds) {
    if (!existingSet.has(id)) {
      throw new AppError("invalid_input", `${field} contains unknown id: ${id}`);
    }
  }
}

type IdIndexContext = {
  ids: string[];
  indexById: Map<string, number>;
  field: "task_id" | "subtask_id";
};

function buildIdIndexContext(ids: string[], field: "task_id" | "subtask_id" = "task_id"): IdIndexContext {
  const indexById = new Map<string, number>();
  for (const [index, id] of ids.entries()) {
    if (indexById.has(id)) {
      throw new AppError("invalid_input", `${field} cannot contain duplicates`, {
        item_index: index,
        item_id: id
      });
    }
    indexById.set(id, index);
  }
  return { ids, indexById, field };
}

function assertHasUpdateFields(
  item: UpdateTaskInput | UpdateSubtaskInput,
  index: number,
  idField: "task_id" | "subtask_id"
): void {
  const hasTitle = item.title !== undefined;
  const hasNote = item.note !== undefined;
  const hasPriority = item.priority !== undefined;
  const hasDueDate = item.due_date !== undefined;
  if (!hasTitle && !hasNote && !hasPriority && !hasDueDate) {
    throw new AppError("invalid_input", "No update fields provided", {
      item_index: index,
      item_id: (item as { task_id?: string; subtask_id?: string })[idField]
    });
  }
}

async function assertTasksExist(db: Database, context: IdIndexContext): Promise<void> {
  const placeholders = context.ids.map(() => "?").join(", ");
  const rows = await db.all<{ id: string }[]>(
    `SELECT id FROM tasks WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    context.ids
  );
  const existing = new Set(rows.map((row) => row.id));
  for (const id of context.ids) {
    if (!existing.has(id)) {
      throw new AppError("not_found", `task not found: ${id}`, {
        item_index: context.indexById.get(id),
        item_id: id
      });
    }
  }
}

async function assertSubtasksExist(db: Database, context: IdIndexContext): Promise<void> {
  const placeholders = context.ids.map(() => "?").join(", ");
  const rows = await db.all<{ id: string }[]>(
    `SELECT id FROM subtasks WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    context.ids
  );
  const existing = new Set(rows.map((row) => row.id));
  for (const id of context.ids) {
    if (!existing.has(id)) {
      throw new AppError("not_found", `subtask not found: ${id}`, {
        item_index: context.indexById.get(id),
        item_id: id
      });
    }
  }
}

async function assertTasksCanBeManuallyCompleted(db: Database, context: IdIndexContext): Promise<void> {
  const placeholders = context.ids.map(() => "?").join(", ");
  const rows = await db.all<{ task_id: string; total: number }[]>(
    `SELECT task_id, COUNT(1) as total
     FROM subtasks
     WHERE task_id IN (${placeholders}) AND deleted_at IS NULL
     GROUP BY task_id`,
    context.ids
  );
  const subtaskCountByTaskId = new Map(rows.map((row) => [row.task_id, row.total]));
  for (const taskId of context.ids) {
    if ((subtaskCountByTaskId.get(taskId) ?? 0) > 0) {
      throw new AppError("invalid_input", "task status is derived from subtasks", {
        item_index: context.indexById.get(taskId),
        item_id: taskId
      });
    }
  }
}
