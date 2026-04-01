export const SERVER_STATUSES = ['stopped', 'running', 'error', 'creating'] as const;
export const NODE_STATUSES = ['online', 'offline', 'error'] as const;
export const USER_ROLES = ['admin', 'operator', 'viewer'] as const;
export const NOTIFICATION_LEVELS = ['critical', 'warning', 'info'] as const;

export const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'password', 'text', 'list'] as const;
export const CONSOLE_TYPES = ['stdin', 'rcon', 'exec'] as const;
export const QUERY_TYPES = ['minecraft', 'minecraft-bedrock', 'source', 'none'] as const;
export const UPDATE_TYPES = ['image', 'image+version', 'auto'] as const;
export const CONFIG_FORMATS = ['properties', 'json', 'yaml', 'ini', 'text'] as const;

export const DEFAULT_PANEL_PORT = 3000;
export const DEFAULT_LOG_BUFFER_SIZE = 1000;
export const DEFAULT_PLAYER_QUERY_INTERVAL = 15_000;
export const DEFAULT_STATUS_POLL_INTERVAL = 10_000;
export const DEFAULT_IMAGE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
