import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import { createTransport } from 'nodemailer';
import { GoogleAuth } from 'google-auth-library';

export class ChannelNotConfigured extends Error {}

@Injectable()
export class NotificationTransportService {
  constructor(private readonly config: ConfigService) {}
  async send(channel: NotificationChannel, destination: string, notificationId: string) {
    const title = 'BigProject: новое уведомление';
    const message = 'Войдите в приложение, чтобы посмотреть обновление.';
    if (channel === 'EMAIL') {
      const host = this.config.get<string>('SMTP_HOST');
      const from = this.config.get<string>('SMTP_FROM');
      if (!host || !from) throw new ChannelNotConfigured('SMTP is not configured');
      const transport = createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT', '587')),
        secure: this.config.get('SMTP_SECURE', 'false') === 'true',
        connectionTimeout: 10000,
        socketTimeout: 15000,
        auth: this.config.get('SMTP_USER')
          ? { user: this.config.get('SMTP_USER'), pass: this.config.get('SMTP_PASSWORD') }
          : undefined,
      });
      try {
        await transport.sendMail({
          from,
          to: { name: '', address: destination },
          subject: title,
          text: message,
          messageId: `<${notificationId}@bigproject.local>`,
        });
      } finally {
        transport.close();
      }
      return;
    }
    if (channel === 'TELEGRAM') {
      const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
      if (!token || !/^-?\d+$/.test(destination))
        throw new ChannelNotConfigured('Telegram destination is not configured');
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: destination, text: `${title}\n${message}` }),
      });
      if (!response.ok) throw new Error('Telegram delivery failed');
      const result = (await response.json()) as { ok?: boolean };
      if (!result.ok) throw new Error('Telegram rejected delivery');
      return;
    }
    if (channel === 'PUSH') {
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      if (!projectId) throw new ChannelNotConfigured('Firebase is not configured');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
      const client = await auth.getClient();
      await client.request({
        url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
        method: 'POST',
        timeout: 15000,
        data: {
          message: {
            token: destination,
            notification: { title, body: message },
            data: { notificationId },
          },
        },
      });
      return;
    }
    throw new ChannelNotConfigured('Unsupported delivery channel');
  }
}
