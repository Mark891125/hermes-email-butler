export interface NotifyInput {
  channel: string;
  title: string;
  message: string;
}

export interface Notifier {
  notify(input: NotifyInput): Promise<{ sent: boolean }>;
}
