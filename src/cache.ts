export class SplunkSearchCache {
  private cache: { [key: string]: { value: any, expiresAt?: number } } = {};

  constructor() {}

  set(key: string, value: any, ttlMilliseconds?: number): void {
    if (ttlMilliseconds) {
      this.cache[key] = {
        value,
        expiresAt: Date.now() + ttlMilliseconds,
      };
    } else {
      this.cache[key] = { value };
    }
  }

  get(key: string): any {
    const item = this.cache[key];

    if (!item) {
      return undefined;
    }

    if (item.expiresAt && item.expiresAt < Date.now()) {
      delete this.cache[key];
      return undefined;
    }

    return item.value;
  }

  // Optional: a cleanup method for expired items, though get can handle it too
  // private remove(key: string): void { delete this.cache[key]; }
}
