import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TodoService } from "../src/service.js";
import { TodoStore } from "../src/store.js";
import { AppError } from "../src/types.js";

async function setupService(): Promise<TodoService> {
  const dir = await mkdtemp(join(tmpdir(), "todo-mcp-service-"));
  return new TodoService(new TodoStore(join(dir, "todo.db")));
}

test("createTask default priority is 5 and listTasks sorts by priority asc", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });

  const t1 = await service.createTask({ plan_id: plan.id, title: "p5" });
  const t2 = await service.createTask({ plan_id: plan.id, title: "p1", priority: 1 });
  const t3 = await service.createTask({ plan_id: plan.id, title: "p3", priority: 3 });

  assert.equal(t1.priority, 5);

  const listed = await service.listTasks({ plan_id: plan.id });
  assert.deepEqual(
    listed.items.map((item) => item.id),
    [t2.id, t3.id, t1.id]
  );
});

test("subtask completion drives parent task status", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "task" });

  const s1 = await service.createSubtask({ task_id: task.id, title: "a" });
  const s2 = await service.createSubtask({ task_id: task.id, title: "b" });

  await service.completeSubtask(s1.id, true);
  const afterOne = await service.getTask(task.id);
  assert.equal(afterOne.status, "todo");

  await service.completeSubtask(s2.id, true);
  const afterAll = await service.getTask(task.id);
  assert.equal(afterAll.status, "done");

  await service.completeSubtask(s1.id, false);
  const afterRollback = await service.getTask(task.id);
  assert.equal(afterRollback.status, "todo");
});

test("completeTask rejects manual completion when subtasks exist", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "task" });
  await service.createSubtask({ task_id: task.id, title: "sub" });

  await assert.rejects(
    () => service.completeTask(task.id, true),
    (error: unknown) => error instanceof AppError && error.code === "invalid_input"
  );
});

test("soft delete hides records by default and include_deleted can query them", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "task" });
  const subtask = await service.createSubtask({ task_id: task.id, title: "sub" });

  await service.deleteSubtask(subtask.id);
  await service.deleteTask(task.id);

  await assert.rejects(
    () => service.getTask(task.id),
    (error: unknown) => error instanceof AppError && error.code === "not_found"
  );

  const deletedTask = await service.getTask(task.id, true);
  assert.ok(deletedTask.deleted_at);

  await service.deletePlan(plan.id);
  await assert.rejects(
    () => service.getPlan(plan.id),
    (error: unknown) => error instanceof AppError && error.code === "not_found"
  );

  const deletedPlan = await service.getPlan(plan.id, true);
  assert.ok(deletedPlan.deleted_at);
});

test("getPlanTree returns nested tasks/subtasks and progress summary", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const taskA = await service.createTask({ plan_id: plan.id, title: "A" });
  await service.createTask({ plan_id: plan.id, title: "B" });

  const s1 = await service.createSubtask({ task_id: taskA.id, title: "s1" });
  await service.createSubtask({ task_id: taskA.id, title: "s2" });
  await service.completeSubtask(s1.id, true);

  const tree = await service.getPlanTree(plan.id);

  assert.equal(tree.plan.id, plan.id);
  assert.equal(tree.summary.total_tasks, 2);
  assert.equal(tree.summary.total_subtasks, 2);
  assert.equal(tree.summary.done_subtasks, 1);
  assert.equal(tree.tasks[0]?.progress.total_subtasks, 2);
});
