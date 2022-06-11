interface Platform {
  name: string;

  read?: () => Promise<string>;
  write: (text: string) => Promise<void>;
}

type PlatformMethods = "read" | "write";

export type { Platform, Platform as default, PlatformMethods };
