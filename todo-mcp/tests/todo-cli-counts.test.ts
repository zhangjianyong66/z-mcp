import assert from "node:assert/strict";
import test from "node:test";
import { printPlanList, printPlanTaskList, printTaskDetail } from "../scripts/todo-cli.js";

function captureLogs(run: () => void): string[] {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalClear = console.clear;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  };
  console.clear = () => {};
  try {
    run();
  } finally {
    console.log = originalLog;
    console.clear = originalClear;
  }
  return logs;
}

test("printPlanList shows total count for current filtered plans", () => {
  const plans = [
    { plan: { id: "1", title: "A", description: "", status: "active", created_at: "", updated_at: "" }, isDone: false, taskSummary: "0/1 任务" },
    { plan: { id: "2", title: "B", description: "", status: "active", created_at: "", updated_at: "" }, isDone: true, taskSummary: "1/1 任务" }
  ] as any;

  const todoLogs = captureLogs(() => printPlanList(plans, "todo", 0, 10, 0));
  assert.equal(todoLogs.some((line) => line.includes("总计划: 1")), true);

  const doneLogs = captureLogs(() => printPlanList(plans, "done", 0, 10, 0));
  assert.equal(doneLogs.some((line) => line.includes("总计划: 1")), true);
});

test("printPlanTaskList shows total count for current filtered tasks", () => {
  const tree = {
    plan: { id: "p1", title: "P", description: "", status: "active", created_at: "", updated_at: "" },
    tasks: [
      { id: "t1", plan_id: "p1", title: "todo", note: "", priority: 1, status: "todo", due_date: null, order_index: 1, created_at: "", updated_at: "", subtasks: [], progress: { total_subtasks: 0, done_subtasks: 0, completion_rate: 0 } },
      { id: "t2", plan_id: "p1", title: "done", note: "", priority: 1, status: "done", due_date: null, order_index: 2, created_at: "", updated_at: "", subtasks: [], progress: { total_subtasks: 0, done_subtasks: 0, completion_rate: 0 } }
    ],
    summary: { total_tasks: 2, done_tasks: 1, total_subtasks: 0, done_subtasks: 0, completion_rate: 0.5 }
  } as any;

  const todoLogs = captureLogs(() => printPlanTaskList(tree, "todo", 0, 10, 0));
  assert.equal(todoLogs.some((line) => line.includes("总任务: 1")), true);

  const doneLogs = captureLogs(() => printPlanTaskList(tree, "done", 0, 10, 0));
  assert.equal(doneLogs.some((line) => line.includes("总任务: 1")), true);
});

test("printTaskDetail shows subtask total count including zero", () => {
  const tree = {
    plan: { id: "p1", title: "P", description: "", status: "active", created_at: "", updated_at: "" }
  } as any;

  const task = {
    id: "t1",
    plan_id: "p1",
    title: "Task",
    note: "",
    priority: 1,
    status: "todo",
    due_date: null,
    order_index: 1,
    created_at: "",
    updated_at: "",
    subtasks: [
      { id: "s1", task_id: "t1", title: "todo-sub", note: "", priority: 1, status: "todo", due_date: null, order_index: 1, created_at: "", updated_at: "" },
      { id: "s2", task_id: "t1", title: "done-sub", note: "", priority: 1, status: "done", due_date: null, order_index: 2, created_at: "", updated_at: "" }
    ]
  } as any;

  const todoLogs = captureLogs(() => printTaskDetail(tree, task, "todo", 0, 10, 120));
  assert.equal(todoLogs.some((line) => line.includes("总子任务: 1")), true);

  const doneLogs = captureLogs(() => printTaskDetail(tree, task, "done", 0, 10, 120));
  assert.equal(doneLogs.some((line) => line.includes("总子任务: 1")), true);

  const emptyDoneTask = { ...task, subtasks: [] };
  const emptyLogs = captureLogs(() => printTaskDetail(tree, emptyDoneTask, "done", 0, 10, 120));
  assert.equal(emptyLogs.some((line) => line.includes("总子任务: 0")), true);
});
