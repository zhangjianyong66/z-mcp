export type TaskStatus = "todo" | "done";
export type PlanStatus = "active" | "archived";

export type Plan = {
  id: string;
  title: string;
  description?: string;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type Task = {
  id: string;
  plan_id: string;
  title: string;
  note?: string;
  priority: number;
  status: TaskStatus;
  due_date?: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  deleted_at?: string;
};

export type SubTask = {
  id: string;
  task_id: string;
  title: string;
  note?: string;
  priority: number;
  status: TaskStatus;
  due_date?: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  deleted_at?: string;
};

export type ListPlansInput = {
  status?: PlanStatus;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
};

export type ListTasksInput = {
  plan_id: string;
  status?: TaskStatus;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
};

export type ListSubtasksInput = {
  task_id: string;
  status?: TaskStatus;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
};

export type UpdatePlanInput = {
  title?: string;
  description?: string;
  status?: PlanStatus;
};

export type UpdateTaskInput = {
  title?: string;
  note?: string;
  priority?: number;
  due_date?: string;
};

export type UpdateSubtaskInput = {
  title?: string;
  note?: string;
  priority?: number;
  due_date?: string;
};

export type PlanTreeTask = Task & {
  subtasks: SubTask[];
  progress: {
    total_subtasks: number;
    done_subtasks: number;
    completion_rate: number;
  };
};

export type PlanTree = {
  plan: Plan;
  tasks: PlanTreeTask[];
  summary: {
    total_tasks: number;
    done_tasks: number;
    total_subtasks: number;
    done_subtasks: number;
    completion_rate: number;
  };
};

export type ToolResult<T> = {
  code: number;
  data: T;
  request_meta: {
    tool: string;
    generated_at: string;
  };
};

export type ErrorCode = "invalid_input" | "not_found" | "config_error" | "io_error" | "internal_error";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
