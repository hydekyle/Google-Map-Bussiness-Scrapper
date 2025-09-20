import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // API Keys
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Search Configuration
  search: {
    location: process.env.SEARCH_LOCATION || 'Madrid, Spain',
    radius: parseInt(process.env.SEARCH_RADIUS) || 10000,
    businessTypes: process.env.BUSINESS_TYPES?.split(',') || ['restaurant', 'hair_care', 'beauty_salon'],
    maxResults: parseInt(process.env.MAX_RESULTS) || 50
  },

  // Scraping Configuration
  scraping: {
    browser: process.env.SCRAPING_BROWSER || 'playwright', // 'puppeteer' or 'playwright'
    headless: process.env.SCRAPING_HEADLESS !== 'false',
    timeout: parseInt(process.env.SCRAPING_TIMEOUT) || 30000,
    persistentCache: process.env.PERSISTENT_CACHE !== 'false', // Enable by default
    userDataDir: process.env.USER_DATA_DIR, // Optional custom cache directory
    viewport: {
      width: parseInt(process.env.VIEWPORT_WIDTH) || 1366,
      height: parseInt(process.env.VIEWPORT_HEIGHT) || 768
    },
    userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  },

  // LLM Configuration
  llm: {
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 100,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
    batchSize: parseInt(process.env.LLM_BATCH_SIZE) || 5
  },

  // WhatsApp Configuration
  whatsapp: {
    messageDelay: parseInt(process.env.MESSAGE_DELAY) || 5000,
    maxMessagesPerHour: parseInt(process.env.MAX_MESSAGES_PER_HOUR) || 50,
    batchSize: parseInt(process.env.WHATSAPP_BATCH_SIZE) || 10,
    delayBetweenBatches: parseInt(process.env.DELAY_BETWEEN_BATCHES) || 30000
  },

  // Message Template Configuration
  messageTemplate: {
    yourName: process.env.YOUR_NAME || '[TU_NOMBRE]',
    defaultTemplate: process.env.DEFAULT_TEMPLATE || 'default',
    customTemplate: process.env.MESSAGE_TEMPLATE
  },

  // Rate Limiting
  rateLimiting: {
    requestsPerMinute: parseInt(process.env.REQUESTS_PER_MINUTE) || 10,
    delayBetweenRequests: parseInt(process.env.DELAY_BETWEEN_REQUESTS) || 100
  },

  // File Paths
  paths: {
    data: process.env.DATA_PATH || './data',
    logs: process.env.LOGS_PATH || './logs',
    output: process.env.OUTPUT_PATH || './output',
    leads: process.env.LEADS_PATH || './data/leads.json',
    enrichedLeads: process.env.ENRICHED_LEADS_PATH || './data/enriched_leads.json',
    messages: process.env.MESSAGES_PATH || './data/messages.json',
    messageLog: process.env.MESSAGE_LOG_PATH || './logs/whatsapp_messages.json'
  },

  // Business Type Mapping
  businessTypeMapping: {
    'restaurant': ['restaurant', 'food', 'meal_takeaway', 'meal_delivery'],
    'hair_care': ['hair_care', 'beauty_salon'],
    'gym': ['gym', 'spa', 'health'],
    'retail': ['store', 'shopping_mall', 'clothing_store']
  },

  // Default Search Queries
  defaultQueries: {
    restaurants: [
      'restaurantes',
      'bares',
      'cafeterías',
      'pizzerías'
    ],
    beauty: [
      'peluquerías',
      'salones de belleza',
      'centros de estética',
      'spas'
    ],
    fitness: [
      'gimnasios',
      'centros de fitness',
      'estudios de yoga'
    ],
    comics: [
      'tiendas de cómics',
      'comic book stores',
      'librerías de cómics',
      'tiendas de manga',
      'comics y manga',
      'tiendas de cómics y manga'
    ]
  },

  // Validation Rules
  validation: {
    minRating: parseFloat(process.env.MIN_RATING) || 3.0,
    minReviews: parseInt(process.env.MIN_REVIEWS) || 5,
    requirePhone: process.env.REQUIRE_PHONE !== 'false',
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 1600
  }
};

// Validation function
export function validateConfig() {
  const errors = [];

  if (!config.googlePlacesApiKey) {
    errors.push('GOOGLE_PLACES_API_KEY is required');
  }

  if (!config.openaiApiKey) {
    errors.push('OPENAI_API_KEY is required');
  }

  if (!config.messageTemplate.yourName || config.messageTemplate.yourName === '[TU_NOMBRE]') {
    errors.push('YOUR_NAME should be set in environment variables');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(error => console.error(`- ${error}`));
    return false;
  }

  return true;
}

// Helper function to get business queries
export function getBusinessQueries(type) {
  return config.defaultQueries[type] || [];
}

// Helper function to create file paths
export function ensureDirectories() {
  const fs = require('fs');
  const directories = [
    config.paths.data,
    config.paths.logs,
    config.paths.output
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export default config;