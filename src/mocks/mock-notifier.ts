import type { Notifier, NotifyInput } from '../ports/notifier.js';

export class MockNotifier implements Notifier {
  async notify(_input: NotifyInput): Promise<{ sent: boolean }> {
    return { sent: true };
  }
}
