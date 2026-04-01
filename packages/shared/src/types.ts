// =====================
// SERVER
// =====================

export type ServerStatus = 'stopped' | 'running' | 'error' | 'creating';

export interface Server {
  id: string;
  nodeId: string;
  name: string;
  templateSlug: string;
  containerId: string | null;
  status: ServerStatus;
  ports: PortMapping[];
  environment: Record<string, string>;
  configValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface PortMapping {
  name: string;
  host: number;
  container: number;
  protocol: 'tcp' | 'udp';
}

// =====================
// NODE
// =====================

export type NodeStatus = 'online' | 'offline' | 'error';

export interface GameNode {
  id: string;
  name: string;
  host: string;
  tlsConfig: TlsConfig | null;
  description: string | null;
  status: NodeStatus;
  createdAt: string;
}

export interface TlsConfig {
  ca: string;
  cert: string;
  key: string;
}

export interface NodeResources {
  cpuPercent: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
}

// =====================
// TEMPLATE
// =====================

export interface GameTemplate {
  slug: string;
  name: string;
  icon: string;
  image: string;
  category: string;
  docker: DockerConfig;
  ports: PortDefinition[];
  volumes: VolumeDefinition[];
  console: ConsoleConfig;
  query: QueryConfig;
  update: UpdateConfig;
  configGroups: ConfigGroup[];
  environment: EnvironmentConfig;
  configFiles: ConfigFileDefinition[];
  quickCommands?: { label: string; command: string }[];
}

export interface DockerConfig {
  image: string;
  stopSignal: string;
  stopTimeout: number;
}

export interface PortDefinition {
  name: string;
  container: number;
  protocol: 'tcp' | 'udp';
  defaultHost: number;
}

export interface VolumeDefinition {
  name: string;
  container: string;
}

export interface ConsoleConfig {
  type: 'stdin' | 'rcon' | 'exec';
  charset: string;
}

export interface QueryConfig {
  type: 'minecraft' | 'minecraft-bedrock' | 'source' | 'none';
  port: number;
}

export interface UpdateConfig {
  type: 'image' | 'image+version' | 'auto';
  versionEnv?: string;
  versionValues?: {
    type: 'dynamic';
    source: string;
    description: string;
  };
  description?: string;
}

export interface ConfigGroup {
  id: string;
  label: string;
  order: number;
  advanced?: boolean;
}

export interface EnvironmentConfig {
  fixed: Record<string, string>;
  configurable: ConfigField[];
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'password' | 'text' | 'list';
  default: string | number | boolean;
  group?: string;
  description?: string;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
  };
  dependsOn?: {
    key: string;
    value: string | number | boolean;
  };
}

export interface ConfigFileDefinition {
  name: string;
  path: string;
  format: 'properties' | 'json' | 'yaml' | 'ini' | 'text';
  description?: string;
  managedFields?: ConfigField[];
}

// =====================
// PRESET
// =====================

export interface Preset {
  id: string;
  templateSlug: string;
  name: string;
  description: string | null;
  environment: Record<string, string>;
  configValues: Record<string, string>;
  portsOffset: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// =====================
// USER & AUTH
// =====================

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// =====================
// EVENTS & NOTIFICATIONS
// =====================

export interface AuditLogEntry {
  id: number;
  userId: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface ServerEvent {
  id: number;
  serverId: string;
  type: string;
  message: string | null;
  createdAt: string;
}

export type NotificationLevel = 'critical' | 'warning' | 'info';

export interface Notification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string | null;
  serverId: string | null;
  nodeId: string | null;
  read: boolean;
  createdAt: string;
}

export interface Backup {
  id: string;
  serverId: string;
  name: string;
  filePath: string;
  sizeBytes: number | null;
  createdBy: string | null;
  createdAt: string;
}

// =====================
// WEBSOCKET EVENTS
// =====================

export type WsEvent =
  | { type: 'server:status'; serverId: string; nodeId: string; status: ServerStatus }
  | { type: 'server:stats'; serverId: string; cpu: number; memory: number }
  | { type: 'server:players'; serverId: string; online: number; max: number; players: string[] }
  | { type: 'server:created'; serverId: string; nodeId: string }
  | { type: 'server:deleted'; serverId: string }
  | { type: 'node:status'; nodeId: string; status: NodeStatus }
  | { type: 'node:resources'; nodeId: string; resources: NodeResources }
  | { type: 'notification'; notification: Notification };

// =====================
// API RESPONSES
// =====================

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
