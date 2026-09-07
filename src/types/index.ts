export type UserRole = "user" | "admin";

export interface User {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
  prompts_seeded?: number;
}

export interface Session {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string;
}

export interface Asset {
  id: number;
  user_id: number;
  kind: "article" | "image" | "video" | "misc";
  title: string;
  content: string;
  url: string;
  file_path: string;
  platform: string;
  model: string;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  module: string;
  platform: string;
  system_prompt: string;
  user_prompt_template: string;
  is_builtin: boolean;
  updated_at?: string;
}

export interface AIModel {
  id: string;
  name: string;
  type: "text" | "image" | "video";
  provider: string;
  endpoint: string;
  api_key?: string;
  status: "active" | "disabled";
  is_builtin: boolean;
  description?: string;
}

export interface ModuleDefaults {
  [moduleKey: string]: string; // moduleKey -> modelId
}

export interface SocialAccount {
  id: number;
  user_id: number;
  platform: string;
  account_name: string;
  avatar_url?: string;
  status: string;
  extra?: Record<string, unknown>;
  created_at: string;
}

export interface WorkspaceState {
  inputs: Record<string, string>;
  scriptContent?: string;
  storyboard?: unknown[];
  productContext?: {
    title: string;
    price?: string;
    url?: string;
    images?: string[];
    bullets?: string[];
    rawHtml?: string;
    text?: string;
  };
  currentArticle?: {
    title: string;
    content: string;
    images?: string[];
    platform?: string;
  };
  selections?: Record<string, string>;
  savedAt?: string;
}

export interface ScrapeProductResult {
  success: boolean;
  title?: string;
  price?: string;
  originalPrice?: string;
  images?: string[];
  bullets?: string[];
  specs?: Record<string, string>;
  description?: string;
  url?: string;
  platform?: string;
  antibot?: boolean;
  message?: string;
}

export interface WebSearchResult {
  title: string;
  snippet: string;
  source: string;
  url: string;
  date?: string;
}
