/** Tapatalk API response types */

export interface TapatalkConfig {
  sys_version?: string;
  version?: string;
  api_level?: string;
  is_open?: boolean;
  guest_okay?: boolean;
  guest_search?: boolean;
  min_search_length?: number;
  get_latest_topic?: boolean;
  get_id_by_url?: boolean;
  subscribe_forum?: boolean;
  mark_read?: boolean;
  multi_quote?: boolean;
  support_md5?: boolean;
  [key: string]: unknown;
}

export interface TapatalkForum {
  forum_id: string;
  forum_name: string;
  description?: string;
  parent_id: string;
  logo_url?: string;
  new_post?: boolean;
  is_protected?: boolean;
  is_subscribed?: boolean;
  sub_only?: boolean;
  url?: string;
  child?: TapatalkForum[];
}

export interface TapatalkTopic {
  forum_id: string;
  topic_id: string;
  topic_title: string;
  prefix?: string;
  topic_author_id?: string;
  topic_author_name?: string;
  is_subscribed?: boolean;
  is_closed?: boolean;
  icon_url?: string;
  last_reply_time?: string;
  timestamp?: string;
  reply_number?: number;
  new_post?: boolean;
  view_number?: number;
  short_content?: string;
}

export interface TapatalkTopicList {
  total_topic_num?: number;
  forum_id?: string;
  forum_name?: string;
  can_post?: boolean;
  topics?: TapatalkTopic[];
}

export interface TapatalkPost {
  post_id: string;
  post_title?: string;
  post_content: string;
  post_author_id?: string;
  post_author_name: string;
  is_online?: boolean;
  can_edit?: boolean;
  icon_url?: string;
  post_time?: string;
  timestamp?: string;
  attachments?: TapatalkAttachment[];
  thanks_info?: Array<{ userid: string; username: string }>;
  likes_info?: Array<{ userid: string; username: string }>;
}

export interface TapatalkAttachment {
  content_type?: string;
  thumbnail_url?: string;
  url?: string;
  filename?: string;
  filesize?: number;
}

export interface TapatalkThread {
  total_post_num?: number;
  forum_id?: string;
  forum_name?: string;
  topic_id?: string;
  topic_title?: string;
  topic_author_id?: string;
  topic_author_name?: string;
  view_number?: number;
  is_subscribed?: boolean;
  is_closed?: boolean;
  can_reply?: boolean;
  posts?: TapatalkPost[];
}

export interface TapatalkSearchResult {
  total_topic_num?: number;
  total_post_num?: number;
  search_id?: string;
  topics?: TapatalkTopic[];
  posts?: Array<
    TapatalkTopic & {
      post_id?: string;
      post_title?: string;
      post_author_id?: string;
      post_author_name?: string;
    }
  >;
}

export interface TapatalkUserInfo {
  user_id?: string;
  username?: string;
  post_count?: number;
  reg_time?: string;
  last_activity_time?: string;
  is_online?: boolean;
  display_text?: string;
  icon_url?: string;
  current_activity?: string;
  custom_fields_list?: Array<{ name: string; value: string }>;
  [key: string]: unknown;
}

export interface TapatalkBoardStat {
  total_threads?: number;
  total_posts?: number;
  total_members?: number;
  online_visitors?: number;
  [key: string]: unknown;
}

export interface TapatalkLoginResult {
  result: boolean;
  result_text?: string;
  user_id?: string;
  login_name?: string;
  username?: string;
  user_type?: string;
  can_pm?: boolean;
  can_search?: boolean;
  can_moderate?: boolean;
  post_count?: number;
}

export interface TapatalkNewTopicResult {
  result: boolean;
  result_text?: string;
  topic_id?: string;
  state?: number;
}

export interface TapatalkReplyResult {
  result: boolean;
  result_text?: string;
  post_id?: string;
  state?: number;
}
