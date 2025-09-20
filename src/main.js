import { GoogleMapsScraper } from './googleMapsScraper.js';
import { PlaywrightGoogleMapsScraper } from './playwrightScraper.js';
import { GooglePlacesAPI } from './googlePlacesApi.js';
import { MessageGenerator } from './messageGenerator.js';
import { WhatsAppSender } from './whatsappSender.js';
import { MessageTemplate } from './messageTemplate.js';
import { config, validateConfig } from './config.js';
import fs from 'fs/promises';
import path from 'path';

class LeadGenerationOrchestrator {
  constructor() {
    this.scraper = null;
    this.placesApi = null;
    this.messageGenerator = null;
    this.whatsappSender = null;
    this.messageTemplate = null;
    this.stats = {
      businessesScraped: 0,
      businessesEnriched: 0,
      messagesGenerated: 0,
      messagesSent: 0,
      startTime: null,
      endTime: null
    };
  }

  async initialize() {
    console.log('🚀 Iniciando sistema de generación de leads...');

    // Validate configuration
    if (!validateConfig()) {
      throw new Error('Configuration validation failed');
    }

    // Create directories
    await this.ensureDirectories();

    // Initialize components
    const scraperOptions = {
      headless: config.scraping.headless,
      viewport: config.scraping.viewport,
      userAgent: config.scraping.userAgent,
      maxResults: config.search.maxResults,
      persistentCache: config.scraping.persistentCache,
      userDataDir: config.scraping.userDataDir
    };

    if (config.scraping.browser === 'playwright') {
      console.log('🎭 Using Playwright browser engine');
      this.scraper = new PlaywrightGoogleMapsScraper(scraperOptions);
    } else {
      console.log('🐾 Using Puppeteer browser engine');
      this.scraper = new GoogleMapsScraper(scraperOptions);
    }

    this.placesApi = new GooglePlacesAPI(config.googlePlacesApiKey);

    this.messageGenerator = new MessageGenerator(config.openaiApiKey, {
      model: config.llm.model,
      maxTokens: config.llm.maxTokens,
      temperature: config.llm.temperature
    });

    this.messageTemplate = new MessageTemplate({
      yourName: config.messageTemplate.yourName,
      defaultTemplate: config.messageTemplate.defaultTemplate
    });

    console.log('✅ Componentes inicializados correctamente');
  }

  async runFullPipeline(options = {}) {
    this.stats.startTime = new Date();
    console.log(`\n📊 Iniciando pipeline completo - ${this.stats.startTime.toLocaleString()}`);

    try {
      // Step 1: Scrape businesses
      console.log('\n🔍 Paso 1: Scrapeando negocios de Google Maps...');
      const businesses = await this.scrapeBusinesses(options);
      this.stats.businessesScraped = businesses.length;
      console.log(`✅ ${businesses.length} negocios encontrados`);

      if (businesses.length === 0) {
        console.log('❌ No se encontraron negocios. Terminando pipeline.');
        return;
      }

      // Step 2: Enrich with Google Places data
      console.log('\n🔍 Paso 2: Enriqueciendo datos con Google Places API...');
      const enrichedBusinesses = await this.enrichBusinessData(businesses);
      this.stats.businessesEnriched = enrichedBusinesses.filter(b => b.enriched).length;
      console.log(`✅ ${this.stats.businessesEnriched} negocios enriquecidos`);

      // Step 3: Filter quality businesses
      console.log('\n🔍 Paso 3: Filtrando negocios de calidad...');
      const qualityBusinesses = this.filterQualityBusinesses(enrichedBusinesses);
      console.log(`✅ ${qualityBusinesses.length} negocios de calidad seleccionados`);

      // Step 4: Generate personalized messages
      console.log('\n🔍 Paso 4: Generando mensajes personalizados...');
      const messagesData = await this.generatePersonalizedMessages(qualityBusinesses);
      this.stats.messagesGenerated = messagesData.length;
      console.log(`✅ ${messagesData.length} mensajes generados`);

      // Step 5: Send WhatsApp messages (optional)
      // if (options.sendMessages) {
      //   console.log('\n🔍 Paso 5: Enviando mensajes por WhatsApp...');
      //   const results = await this.sendWhatsAppMessages(messagesData);
      //   this.stats.messagesSent = results.filter(r => r.success).length;
      //   console.log(`✅ ${this.stats.messagesSent} mensajes enviados exitosamente`);
      // } else {
      //   console.log('\n⏭️ Paso 5: Omitido (sendMessages = false)');
      //   console.log('💾 Los mensajes han sido guardados y están listos para enviar');
      // }

      // Save final results
      await this.saveFinalResults(messagesData);

      this.stats.endTime = new Date();
      this.printFinalStats();

    } catch (error) {
      console.error('❌ Error en el pipeline:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async scrapeBusinesses(options) {
    const queries = options.queries || [options.businessType].filter(Boolean);
    const location = options.location || config.search.location;
    const allBusinesses = [];

    for (const query of queries) {
      console.log(`  🔍 Buscando: "${query}" en ${location}`);

      try {
        const businesses = await this.scraper.searchBusinesses(query, location);
        console.log(`    ✅ ${businesses.length} negocios encontrados`);

        // Merge results (avoid duplicates)
        businesses.forEach(business => {
          const exists = allBusinesses.find(existing =>
            existing.name === business.name && existing.address === business.address
          );
          if (!exists) {
            allBusinesses.push(business);
          }
        });

        // Delay between queries to avoid being blocked
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`    ❌ Error buscando "${query}":`, error.message);
      }
    }

    // Save scraped data
    const scrapedFile = path.join(config.paths.data, `scraped_businesses_${Date.now()}.json`);
    await this.saveData(allBusinesses, scrapedFile);

    return allBusinesses;
  }

  async enrichBusinessData(businesses) {
    console.log(`  📍 Enriqueciendo ${businesses.length} negocios...`);
    const enrichedBusinesses = [];

    for (let i = 0; i < businesses.length; i++) {
      const business = businesses[i];
      console.log(`    ${i + 1}/${businesses.length}: ${business.name}`);

      try {
        const enriched = await this.placesApi.enrichBusinessData(business);
        enrichedBusinesses.push(enriched);

        // Rate limiting
        if (i % 10 === 0 && i > 0) {
          console.log(`    ⏳ Pausa de rate limiting (${i}/${businesses.length})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`    ❌ Error enriqueciendo ${business.name}:`, error.message);
        enrichedBusinesses.push({ ...business, enriched: false, error: error.message });
      }
    }

    // Save enriched data
    const enrichedFile = path.join(config.paths.data, `enriched_businesses_${Date.now()}.json`);
    await this.saveData(enrichedBusinesses, enrichedFile);

    return enrichedBusinesses;
  }

  filterQualityBusinesses(businesses) {
    return businesses.filter(business => {
      // Must have phone number
      if (config.validation.requirePhone && !business.phone) {
        return false;
      }

      // Must meet minimum rating
      const rating = business.googlePlaceDetails?.currentRating || business.rating || 0;
      if (rating < config.validation.minRating) {
        return false;
      }

      // Must meet minimum reviews
      const reviewCount = business.googlePlaceDetails?.totalReviews || business.reviewCount || 0;
      if (reviewCount < config.validation.minReviews) {
        return false;
      }

      // Must have reviews for personalization
      if (!business.reviews || business.reviews.length === 0) {
        return false;
      }

      return true;
    });
  }

  async generatePersonalizedMessages(businesses) {
    console.log(`  🤖 Generando mensajes para ${businesses.length} negocios...`);

    const contentResults = await this.messageGenerator.generateBatchContent(
      businesses,
      config.llm.batchSize
    );

    const messagesData = this.messageTemplate.generateBulkMessages(contentResults);

    // Save messages data
    const messagesFile = path.join(config.paths.data, `messages_${Date.now()}.json`);
    await this.saveData(messagesData, messagesFile);

    return messagesData;
  }

  async sendWhatsAppMessages(messagesData) {
    console.log(`  📱 Preparando envío de ${messagesData.length} mensajes...`);

    // Filter messages with valid phone numbers
    const validMessages = messagesData.filter(msg => msg.phoneNumber && msg.phoneNumber.trim());

    if (validMessages.length === 0) {
      console.log('❌ No hay mensajes con números de teléfono válidos');
      return [];
    }

    console.log(`  📱 ${validMessages.length} mensajes con números válidos`);

    // Initialize WhatsApp
    this.whatsappSender = new WhatsAppSender({
      messageDelay: config.whatsapp.messageDelay,
      maxMessagesPerHour: config.whatsapp.maxMessagesPerHour
    });

    await this.whatsappSender.initialize();

    // Send messages
    const results = await this.whatsappSender.sendBulkMessages(validMessages, {
      batchSize: config.whatsapp.batchSize,
      delayBetweenBatches: config.whatsapp.delayBetweenBatches
    });

    // Save message log
    await this.whatsappSender.saveMessageLog(config.paths.messageLog);

    return results;
  }

  async saveFinalResults(messagesData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(config.paths.output, `lead_generation_results_${timestamp}.json`);

    const finalResults = {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalMessages: messagesData.length,
        config: {
          searchLocation: config.search.location,
          businessTypes: config.search.businessTypes,
          maxResults: config.search.maxResults
        }
      },
      stats: this.stats,
      messages: messagesData
    };

    await this.saveData(finalResults, resultsFile);
    console.log(`💾 Resultados finales guardados en: ${resultsFile}`);
  }


  async ensureDirectories() {
    const directories = [
      config.paths.data,
      config.paths.logs,
      config.paths.output
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
    }
  }

  async saveData(data, filename) {
    try {
      await fs.writeFile(filename, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error saving data to ${filename}:`, error);
    }
  }

  printFinalStats() {
    const duration = this.stats.endTime - this.stats.startTime;
    const durationMinutes = Math.round(duration / 60000);

    console.log('\n📊 ESTADÍSTICAS FINALES:');
    console.log('═'.repeat(50));
    console.log(`⏱️  Duración total: ${durationMinutes} minutos`);
    console.log(`🏢 Negocios scrapeados: ${this.stats.businessesScraped}`);
    console.log(`📍 Negocios enriquecidos: ${this.stats.businessesEnriched}`);
    console.log(`💬 Mensajes generados: ${this.stats.messagesGenerated}`);
    console.log(`📱 Mensajes enviados: ${this.stats.messagesSent}`);

    if (this.placesApi) {
      const placesStats = this.placesApi.getUsageStats();
      console.log(`💰 Costo Google Places: ~$${placesStats.estimatedCost.toFixed(4)}`);
    }

    if (this.messageGenerator) {
      const llmStats = this.messageGenerator.getUsageStats();
      console.log(`🤖 Costo LLM: ~$${llmStats.estimatedCost.toFixed(4)}`);
    }

    console.log('═'.repeat(50));
  }

  async cleanup() {
    console.log('\n🧹 Limpiando recursos...');

    if (this.scraper) {
      await this.scraper.close();
    }

    if (this.whatsappSender) {
      await this.whatsappSender.close();
    }

    console.log('✅ Cleanup completado');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    businessType: process.env.BUSINESS_TYPE, // default
    sendMessages: false,
    location: process.env.SEARCH_LOCATION
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
        options.businessType = args[++i];
        break;
      case '--location':
        options.location = args[++i];
        break;
      case '--send-messages':
        options.sendMessages = true;
        break;
      case '--queries':
        options.queries = args[++i].split(',');
        break;
      case '--help':
        printHelp();
        return;
    }
  }

  try {
    const orchestrator = new LeadGenerationOrchestrator();
    await orchestrator.initialize();
    await orchestrator.runFullPipeline(options);
  } catch (error) {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
🚀 GENERADOR DE LEADS PARA NEGOCIOS LOCALES

Uso: npm start [opciones]

Opciones:
  --type <término>        Término de búsqueda (ej: "comics", "restaurantes", "peluquerías")
  --location <ubicación>  Ubicación de búsqueda (ej: "Madrid, Spain")
  --send-messages         Enviar mensajes por WhatsApp (requiere configuración)
  --queries <consultas>   Consultas personalizadas separadas por comas
  --help                  Mostrar esta ayuda

Ejemplos:
  npm start --type "comics" --location "Madrid, Spain"
  npm start --type "restaurantes" --location "Barcelona, Spain"
  npm start --queries "pizzerías,hamburguesas,sushi" --location "Valencia"

⚠️  IMPORTANTE: Configurar las variables de entorno en .env antes de usar.
`);
}

// Run if called directly
if (import.meta.url.endsWith('main.js')) {
  main();
}

export { LeadGenerationOrchestrator };