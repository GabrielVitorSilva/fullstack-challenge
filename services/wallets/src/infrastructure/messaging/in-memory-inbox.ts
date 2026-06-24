export class InMemoryInbox {
  private readonly processed = new Set<string>();

  async hasProcessed(messageKey: string): Promise<boolean> {
    return this.processed.has(messageKey);
  }

  async markProcessed(messageKey: string): Promise<void> {
    this.processed.add(messageKey);
  }
}
