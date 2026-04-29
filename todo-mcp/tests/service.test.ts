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

test("batch_create_tasks creates multiple tasks with ascending order_index", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });

  const tasks = await service.batchCreateTasks(plan.id, [
    { title: "a", priority: 1 },
    { title: "b" },
    { title: "c", priority: 3 }
  ]);

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].title, "a");
  assert.equal(tasks[0].priority, 1);
  assert.equal(tasks[1].title, "b");
  assert.equal(tasks[1].priority, 5);
  assert.equal(tasks[2].title, "c");
  assert.equal(tasks[2].priority, 3);

  assert.ok(tasks[0].order_index < tasks[1].order_index);
  assert.ok(tasks[1].order_index < tasks[2].order_index);
});

test("batch_create_subtasks creates multiple subtasks and drives parent status", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "task" });

  const subtasks = await service.batchCreateSubtasks(task.id, [
    { title: "s1" },
    { title: "s2" }
  ]);

  assert.equal(subtasks.length, 2);
  const parent = await service.getTask(task.id);
  assert.equal(parent.status, "todo");
});

test("batch_update_tasks updates multiple tasks", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const t1 = await service.createTask({ plan_id: plan.id, title: "a" });
  const t2 = await service.createTask({ plan_id: plan.id, title: "b" });

  const updated = await service.batchUpdateTasks([
    { task_id: t1.id, title: "a-updated", priority: 1 },
    { task_id: t2.id, note: "note-b" }
  ]);

  assert.equal(updated.length, 2);
  assert.equal(updated[0].title, "a-updated");
  assert.equal(updated[0].priority, 1);
  assert.equal(updated[1].note, "note-b");
});

test("batch_update_tasks rolls back on invalid task_id", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "a" });

  await assert.rejects(
    () =>
      service.batchUpdateTasks([
        { task_id: task.id, title: "valid" },
        { task_id: "non-existent-id", title: "invalid" }
      ]),
    (error: unknown) => error instanceof AppError && error.code === "not_found"
  );

  const after = await service.getTask(task.id);
  assert.equal(after.title, "a");
});

test("batch_update_tasks rejects duplicate task ids with item details", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "a" });

  await assert.rejects(
    () =>
      service.batchUpdateTasks([
        { task_id: task.id, title: "first" },
        { task_id: task.id, title: "second" }
      ]),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_input" &&
      error.details?.item_index === 1 &&
      error.details?.item_id === task.id
  );
});

test("batch_update_tasks rejects empty update item with index details", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "a" });

  await assert.rejects(
    () => service.batchUpdateTasks([{ task_id: task.id }]),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_input" &&
      error.details?.item_index === 0 &&
      error.details?.item_id === task.id
  );
});

test("batch_complete_tasks rejects when any task has subtasks", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const t1 = await service.createTask({ plan_id: plan.id, title: "t1" });
  const t2 = await service.createTask({ plan_id: plan.id, title: "t2" });
  await service.createSubtask({ task_id: t2.id, title: "sub" });

  await assert.rejects(
    () => service.batchCompleteTasks([t1.id, t2.id], true),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_input" &&
      error.details?.item_id === t2.id
  );

  const task1 = await service.getTask(t1.id);
  assert.equal(task1.status, "todo");
});

test("batch_complete_tasks rejects duplicate task ids with item details", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const t1 = await service.createTask({ plan_id: plan.id, title: "t1" });

  await assert.rejects(
    () => service.batchCompleteTasks([t1.id, t1.id], true),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_input" &&
      error.details?.item_index === 1 &&
      error.details?.item_id === t1.id
  );
});

test("batch_complete_tasks succeeds for tasks without subtasks", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const t1 = await service.createTask({ plan_id: plan.id, title: "t1" });
  const t2 = await service.createTask({ plan_id: plan.id, title: "t2" });

  const completed = await service.batchCompleteTasks([t1.id, t2.id], true);
  assert.equal(completed.length, 2);
  assert.equal(completed[0].status, "done");
  assert.equal(completed[1].status, "done");

  const undone = await service.batchCompleteTasks([t1.id], false);
  assert.equal(undone[0].status, "todo");
});

test("batch_complete_subtasks drives parent task to done when all completed", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "task" });
  const s1 = await service.createSubtask({ task_id: task.id, title: "s1" });
  const s2 = await service.createSubtask({ task_id: task.id, title: "s2" });

  const completed = await service.batchCompleteSubtasks([s1.id, s2.id], true);
  assert.equal(completed.length, 2);
  assert.equal(completed[0].status, "done");
  assert.equal(completed[1].status, "done");

  const parent = await service.getTask(task.id);
  assert.equal(parent.status, "done");
});

test("batch_delete_tasks soft deletes tasks and their subtasks", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const t1 = await service.createTask({ plan_id: plan.id, title: "t1" });
  const t2 = await service.createTask({ plan_id: plan.id, title: "t2" });
  await service.createSubtask({ task_id: t1.id, title: "sub1" });

  const deleted = await service.batchDeleteTasks([t1.id, t2.id]);
  assert.equal(deleted.length, 2);
  assert.ok(deleted[0].deleted_at);
  assert.ok(deleted[1].deleted_at);

  await assert.rejects(
    () => service.getTask(t1.id),
    (error: unknown) => error instanceof AppError && error.code === "not_found"
  );

  const listed = await service.listTasks({ plan_id: plan.id });
  assert.equal(listed.items.length, 0);
});

test("batch_delete_subtasks drives parent task status", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "task" });
  const s1 = await service.createSubtask({ task_id: task.id, title: "s1" });
  const s2 = await service.createSubtask({ task_id: task.id, title: "s2" });
  const s3 = await service.createSubtask({ task_id: task.id, title: "s3" });
  await service.completeSubtask(s1.id, true);

  const parentBefore = await service.getTask(task.id);
  assert.equal(parentBefore.status, "todo");

  await service.batchDeleteSubtasks([s2.id, s3.id]);

  const parentAfter = await service.getTask(task.id);
  assert.equal(parentAfter.status, "done");
});

test("batch_delete_subtasks rejects duplicate subtask ids with item details", async () => {
  const service = await setupService();
  const plan = await service.createPlan({ title: "plan" });
  const task = await service.createTask({ plan_id: plan.id, title: "task" });
  const s1 = await service.createSubtask({ task_id: task.id, title: "s1" });

  await assert.rejects(
    () => service.batchDeleteSubtasks([s1.id, s1.id]),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_input" &&
      error.details?.item_index === 1 &&
      error.details?.item_id === s1.id
  );
});
