import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import delay from 'delay';
import fs from 'fs/promises';

export class WhatsAppSender {
  constructor(options = {}) {
    this.client = null;
    this.isReady = false;
    this.messagesSent = 0;
    this.messageDelay = options.messageDelay || 5000; // 5 seconds between messages
    this.maxMessagesPerHour = options.maxMessagesPerHour || 50;
    this.messageLog = [];
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
          ]
        }
      });

      this.client.on('qr', (qr) => {
        console.log('Scan this QR code with your WhatsApp:');
        qrcode.generate(qr, { small: true });
        console.log('Or visit https://web.whatsapp.com and scan the QR code manually');
      });

      this.client.on('ready', () => {
        console.log('WhatsApp client is ready!');
        this.isReady = true;
        resolve();
      });

      this.client.on('authenticated', () => {
        console.log('WhatsApp client authenticated');
      });

      this.client.on('auth_failure', (msg) => {
        console.error('Authentication failed:', msg);
        reject(new Error('WhatsApp authentication failed'));
      });

      this.client.on('disconnected', (reason) => {
        console.log('WhatsApp client disconnected:', reason);
        this.isReady = false;
      });

      this.client.on('message', async (message) => {
        // Log received messages for monitoring responses
        if (!message.fromMe) {
          this.logMessage('RECEIVED', message.from, message.body);
        }
      });

      this.client.initialize().catch(reject);
    });
  }

  async sendMessage(phoneNumber, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    if (this.messagesSent >= this.maxMessagesPerHour) {
      throw new Error('Hourly message limit reached');
    }

    try {
      // Format phone number
      const formattedNumber = this.formatPhoneNumber(phoneNumber);

      // Check if number exists on WhatsApp
      const numberId = await this.client.getNumberId(formattedNumber);

      if (!numberId) {
        throw new Error(`Phone number ${phoneNumber} is not registered on WhatsApp`);
      }

      // Send message
      await this.client.sendMessage(numberId._serialized, message);

      this.messagesSent++;
      this.logMessage('SENT', formattedNumber, message);

      console.log(`Message sent to ${phoneNumber}: ${message.substring(0, 50)}...`);

      // Wait before next message
      await delay(this.messageDelay);

      return {
        success: true,
        phoneNumber: formattedNumber,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logMessage('ERROR', phoneNumber, `Error: ${error.message}`);
      console.error(`Failed to send message to ${phoneNumber}:`, error.message);

      return {
        success: false,
        phoneNumber,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async sendBulkMessages(messages, options = {}) {
    const batchSize = options.batchSize || 10;
    const delayBetweenBatches = options.delayBetweenBatches || 30000; // 30 seconds
    const results = [];

    console.log(`Starting bulk message send: ${messages.length} messages`);
    console.log(`Batch size: ${batchSize}, Delay between batches: ${delayBetweenBatches}ms`);

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(messages.length / batchSize)}`);

      for (const messageData of batch) {
        const result = await this.sendMessage(messageData.phoneNumber, messageData.message);
        results.push({
          ...result,
          businessName: messageData.businessName,
          originalData: messageData
        });

        // Check rate limits
        if (this.messagesSent >= this.maxMessagesPerHour) {
          console.log('Hourly rate limit reached. Stopping bulk send.');
          break;
        }
      }

      // Delay between batches (except for the last batch)
      if (i + batchSize < messages.length && this.messagesSent < this.maxMessagesPerHour) {
        console.log(`Waiting ${delayBetweenBatches / 1000} seconds before next batch...`);
        await delay(delayBetweenBatches);
      }
    }

    return results;
  }

  formatPhoneNumber(phoneNumber) {
    // Remove all non-numeric characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Add country code if not present (assuming Spain +34)
    if (cleaned.length === 9 && !cleaned.startsWith('34')) {
      cleaned = '34' + cleaned;
    }

    // Ensure it starts with the country code
    if (!cleaned.startsWith('34') && cleaned.length === 9) {
      cleaned = '34' + cleaned;
    }

    return cleaned + '@c.us';
  }

  logMessage(type, phoneNumber, message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      phoneNumber,
      message: message.substring(0, 200), // Limit message length in log
    };

    this.messageLog.push(logEntry);

    // Keep only last 1000 entries to prevent memory issues
    if (this.messageLog.length > 1000) {
      this.messageLog = this.messageLog.slice(-1000);
    }
  }

  async saveMessageLog(filename) {
    try {
      await fs.writeFile(filename, JSON.stringify(this.messageLog, null, 2));
      console.log(`Message log saved to ${filename}`);
    } catch (error) {
      console.error('Error saving message log:', error);
    }
  }

  async getStats() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const sentInLastHour = this.messageLog.filter(
      log => log.type === 'SENT' && new Date(log.timestamp) > oneHourAgo
    ).length;

    const receivedInLastHour = this.messageLog.filter(
      log => log.type === 'RECEIVED' && new Date(log.timestamp) > oneHourAgo
    ).length;

    return {
      totalMessagesSent: this.messagesSent,
      sentInLastHour,
      receivedInLastHour,
      remainingHourlyQuota: this.maxMessagesPerHour - sentInLastHour,
      isReady: this.isReady,
      logEntries: this.messageLog.length
    };
  }

  async close() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
    }
  }
}

export default WhatsAppSender;