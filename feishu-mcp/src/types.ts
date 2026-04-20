export type ToolResult<T> = {
  code: number;
  data: T;
  request_meta: {
    tool: string;
    generated_at: string;
  };
};

export type FeishuEnvelope<T> = {
  code: number;
  msg?: string;
  data?: T;
};

export type FeishuChat = {
  chat_id: string;
  name?: string;
  description?: string;
  avatar?: string;
  owner_id?: string;
  chat_type?: string;
  chat_mode?: string;
  external?: boolean;
  tenant_key?: string;
  user_count?: string | number;
  member_count?: number;
  [key: string]: unknown;
};

export type FeishuListChatsData = {
  items?: FeishuChat[];
  page_token?: string;
  has_more?: boolean;
};

export type FeishuGetChatData = {
  chat?: FeishuChat;
};

export type FeishuMember = {
  member_id?: string;
  name?: string;
  tenant_key?: string;
  employee_no?: string;
  member_type?: string;
  member_id_type?: string;
  [key: string]: unknown;
};

export type FeishuListMembersData = {
  items?: FeishuMember[];
  page_token?: string;
  has_more?: boolean;
};

export type FeishuCreateChatPayload = {
  name: string;
  description?: string;
  chat_mode: "group";
  chat_type: "private";
  user_id_list?: string[];
};

export type FeishuUpdateChatPayload = {
  name: string;
};

export type FeishuMembersPayload = {
  id_list: string[];
  member_type: "user";
};

export type NormalizedPageInput = {
  pageSize: number;
  pageToken?: string;
};

export type NormalizedTimeoutInput = {
  timeoutMs: number;
};
