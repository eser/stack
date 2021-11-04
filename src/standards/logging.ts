// taken from RFC5424 (see: https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1)
enum Severity {
    Emergency = 0,  // system is unusable
    Alert = 1,      // action must be taken immediately
    Critical = 2,   // critical conditions
    Error = 3,      // error conditions
    Warning = 4,    // warning conditions
    Notice = 5,     // normal but significant condition
    Info = 6,       // informational messages
    Debug = 7,      // debug-level messages
}

interface Logger {
  log(severity: Severity, message: string, ...args: unknown[]): void;
}

export type {
  Severity,
  Logger,
};
