type LogValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

function format(value: LogValue): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export const logger = {
  info(message: string, value?: LogValue): void {
    console.log(value === undefined ? message : `${message} ${format(value)}`);
  },
  warn(message: string, value?: LogValue): void {
    console.warn(value === undefined ? message : `${message} ${format(value)}`);
  },
  error(message: string, value?: LogValue): void {
    console.error(value === undefined ? message : `${message} ${format(value)}`);
  }
};
