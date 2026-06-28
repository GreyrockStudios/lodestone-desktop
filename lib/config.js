// ─── Config & Constants ───────────────────────────────────────────────────
// Shared constants, feature flags, and detection helpers.

module.exports = {
  REFRESH_INTERVAL_MS: 14 * 60 * 1000, // 14 minutes (tokens expire at 15 min)
  REFRESH_ENDPOINT: '/api/auth/refresh',
  ACCESS_TOKEN_KEY: 'lodestone_access_token',
  REFRESH_TOKEN_KEY: 'lodestone_refresh_token',
  CLOUD_SYNC_KEY: 'lodestone_cloud_sync',
  OLLAMA_URL_KEY: 'lodestone_ollama_url',
  LOCAL_PROVIDER_KEY: 'lodestone_local_provider',
  LOCAL_MODEL_KEY: 'lodestone_local_model',
  LAST_SYNC_KEY: 'lodestone_last_sync_at',

  // Stop words for graph edge auto-generation
  STOP_WORDS: new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','can','shall',
    'must','need','i','me','my','we','our','you','your','he','him','his','she','her',
    'it','its','they','them','their','this','that','these','those','what','which','who',
    'whom','whose','when','where','why','how','all','each','every','both','few','more',
    'most','other','some','such','no','not','only','own','same','so','than','too','very',
    'just','because','but','and','or','if','then','else','while','for','in','on','at',
    'to','from','by','with','about','between','through','during','before','after',
    'above','below','up','down','out','off','over','under','again','further','once',
    'also','of'
  ]),

  // Category → graph node type mapping
  CATEGORY_TO_TYPE: {
    entity: 'entity',
    fact: 'fact',
    preference: 'identity',
    decision: 'decision',
    event: 'event',
    concept: 'concept',
    commitment: 'event',
    note: 'fact',
  },

  // Type → icon mapping
  TYPE_ICONS: {
    identity: '\u{1F52E}',
    entity: '\u{1F464}',
    concept: '\u{1F4A1}',
    event: '\u{1F4C5}',
    fact: '\u{1F4CC}',
  },

  // Default Ollama values
  DEFAULT_OLLAMA_URL: 'http://localhost:11434',
  DEFAULT_OLLAMA_MODEL: 'gemma3:4b',

  // Sync interval
  SYNC_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes

  // Desktop tool definitions for the LLM
  DESKTOP_TOOLS: [
    {
      type: 'function',
      function: {
        name: 'desktop_list_directory',
        description: 'List files and subdirectories in a directory on the user\'s computer. Use this to explore the file system, find files, or understand project structure.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute directory path to list (e.g. "/Users/jay/projects/my-app")' },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_read_file',
        description: 'Read the contents of a file on the user\'s computer. Supports text files up to 1MB. Use this to read code, configs, logs, or documents.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute file path to read' },
            encoding: { type: 'string', description: 'File encoding (default: utf-8)', enum: ['utf-8', 'ascii', 'latin1'] },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_write_file',
        description: 'Write content to a file on the user\'s computer. Creates parent directories if needed. Use this to create or update files, configs, or scripts.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute file path to write' },
            content: { type: 'string', description: 'Content to write to the file' },
            create_dirs: { type: 'boolean', description: 'Create parent directories if they don\'t exist (default: false)' },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_search_files',
        description: 'Search for files by name pattern in a directory. Use this to find specific files across a project.',
        parameters: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Directory to search in' },
            pattern: { type: 'string', description: 'Regex pattern to match filenames (e.g. ".*\\.tsx$" for React files)' },
            max_results: { type: 'number', description: 'Maximum results to return (default: 50)' },
          },
          required: ['directory', 'pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_system_info',
        description: 'Get system information: OS, CPU, memory, disk space, uptime. Use this when the user asks about their computer specs or available resources.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_battery_info',
        description: 'Get battery status: charge percentage, charging state. Use this when the user asks about their battery level or power status.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_wifi_info',
        description: 'Get current Wi-Fi network info: network name, IP address, signal. Use this when troubleshooting connectivity.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_screenshot',
        description: 'Take a screenshot of the user\'s primary display. Returns a base64-encoded PNG image. Use this when the user wants you to see their screen.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_clipboard_read',
        description: 'Read the current contents of the clipboard. Use this when the user says "check my clipboard" or "what did I copy?".',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_clipboard_write',
        description: 'Write text to the clipboard. Use this when the user wants to copy something to their clipboard.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to copy to clipboard' },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_run_command',
        description: 'Run a safe, read-only shell command on the user\'s computer. Only whitelisted commands are allowed (ls, pwd, cat, git status, etc). Dangerous commands are blocked. Use for system diagnostics and file inspection.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to run (must be in allowlist)' },
            timeout: { type: 'number', description: 'Timeout in seconds (default: 10, max: 30)' },
          },
          required: ['command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_open_url',
        description: 'Open a URL in the user\'s default browser. Use this when the user wants to visit a website.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to open (http/https only)' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'desktop_volume',
        description: 'Get or set the system volume level (0-100, macOS only). Use this when the user wants to adjust their volume.',
        parameters: {
          type: 'object',
          properties: {
            level: { type: 'number', description: 'Volume level 0-100. Omit to get current volume.' },
          },
        },
      },
    },
    // ─── Scheduler Tools ───────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'scheduler_create',
        description: 'Create a scheduled task that runs repeatedly. Use this for reminders, check-ins, reports, or system checks that the user wants on a schedule.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Friendly name for this schedule (e.g. "Daily standup reminder", "Weekly report")' },
            task_type: { type: 'string', description: 'What to do when this fires', enum: ['reminder', 'check_in', 'report', 'system_check'] },
            preset: { type: 'string', description: 'How often to run', enum: ['every_minute', 'every_5_minutes', 'every_15_minutes', 'every_30_minutes', 'hourly', 'every_2_hours', 'every_6_hours', 'daily_morning', 'daily_evening', 'daily_noon', 'weekly_monday', 'weekly_friday', 'monthly_first', 'weekdays_9am', 'weekdays_5pm', 'weekends_10am'] },
            message: { type: 'string', description: 'What to say/ask when this fires (the prompt for check-ins, the text for reminders, etc.)' },
            description: { type: 'string', description: 'Optional longer description of what this task does' },
          },
          required: ['name', 'task_type', 'preset'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduler_list',
        description: 'List all scheduled tasks. Shows active and paused tasks with their next run time.',
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'string', description: 'Filter: "active", "inactive", or null for all', enum: ['active', 'inactive'] },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduler_pause',
        description: 'Pause a scheduled task. It won\'t fire until resumed.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The task ID to pause' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduler_resume',
        description: 'Resume a paused scheduled task.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The task ID to resume' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'scheduler_delete',
        description: 'Delete a scheduled task permanently.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The task ID to delete' },
          },
          required: ['id'],
        },
      },
    },
  ],

  // Scheduler cron presets
  SCHEDULER_PRESETS: {
    'every_minute': '* * * * *',
    'every_5_minutes': '*/5 * * * *',
    'every_15_minutes': '*/15 * * * *',
    'every_30_minutes': '*/30 * * * *',
    'hourly': '0 * * * *',
    'every_2_hours': '0 */2 * * *',
    'every_6_hours': '0 */6 * * *',
    'daily_morning': '0 8 * * *',
    'daily_evening': '0 18 * * *',
    'daily_noon': '0 12 * * *',
    'weekly_monday': '0 9 * * 1',
    'weekly_friday': '0 9 * * 5',
    'monthly_first': '0 9 1 * *',
    'weekdays_9am': '0 9 * * 1-5',
    'weekdays_5pm': '0 17 * * 1-5',
    'weekends_10am': '0 10 * * 0,6',
  },
};