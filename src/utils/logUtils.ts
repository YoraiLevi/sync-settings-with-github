export enum LogLevel {
    ERROR = 'ERROR',
    WARN = 'WARN',
    INFO = 'INFO',
    DEBUG = 'DEBUG',
    TRACE = 'TRACE'
}

// Map log levels to numeric priorities for comparison
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    [LogLevel.ERROR]: 0,
    [LogLevel.WARN]: 1,
    [LogLevel.INFO]: 2,
    [LogLevel.DEBUG]: 3,
    [LogLevel.TRACE]: 4
};

interface LoggerOptions {
    minLevel?: LogLevel;
    serviceName: string;
}

export interface Logger {
    error: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    debug: (message: string, ...args: any[]) => void;
    trace: (message: string, ...args: any[]) => void;
}

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;

export function createLogger(options: LoggerOptions | string): Logger {
    const opts: LoggerOptions = typeof options === 'string' ? { serviceName: options } : options;
    const minLevel = opts.minLevel ?? LOG_LEVEL;
    const serviceName = opts.serviceName;

    function formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.padEnd(5)}] [${serviceName}] ${message}`;
    }

    function log(level: LogLevel, message: string, ...args: any[]) {
        if (LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[minLevel]) {
            const formattedMessage = formatMessage(level, message);
            switch (level) {
                case LogLevel.ERROR:
                    console.error(formattedMessage, ...args);
                    break;
                case LogLevel.WARN:
                    console.warn(formattedMessage, ...args);
                    break;
                default:
                    console.log(formattedMessage, ...args);
            }
        }
    }

    return {
        error: (message: string, ...args: any[]) => log(LogLevel.ERROR, message, ...args),
        warn: (message: string, ...args: any[]) => log(LogLevel.WARN, message, ...args),
        info: (message: string, ...args: any[]) => log(LogLevel.INFO, message, ...args),
        debug: (message: string, ...args: any[]) => log(LogLevel.DEBUG, message, ...args),
        trace: (message: string, ...args: any[]) => log(LogLevel.TRACE, message, ...args)
    };
} 