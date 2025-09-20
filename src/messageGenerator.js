import OpenAI from 'openai';
import delay from 'delay';

export class MessageGenerator {
  constructor(apiKey, options = {}) {
    this.openai = new OpenAI({ apiKey });
    this.model = options.model || 'gpt-3.5-turbo';
    this.maxTokens = options.maxTokens || 100;
    this.temperature = options.temperature || 0.7;
    this.requestCount = 0;
  }

  async generatePersonalizedContent(business) {
    try {
      await delay(100); // Rate limiting

      const reviews = business.reviews || [];
      const positiveReviews = reviews.filter(review => review.rating >= 4);

      // Create context from reviews
      const reviewContext = positiveReviews
        .map(review => review.text)
        .join(' ')
        .substring(0, 1000); // Limit context to control costs

      const businessType = this.inferBusinessType(business);

      const prompt = this.createPrompt(business.name, businessType, reviewContext);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en marketing para negocios locales. Genera solo UNA frase personalizada y natural basada en las reseñas, mencionando aspectos específicos que destacan los clientes. La frase debe sonar humana y cercana, no promocional.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      this.requestCount++;

      const personalizedContent = response.choices[0]?.message?.content?.trim() || '';

      return {
        personalizedContent,
        businessName: business.name,
        businessType,
        reviewCount: reviews.length,
        averageRating: business.googlePlaceDetails?.currentRating || business.rating,
        tokensUsed: response.usage?.total_tokens || 0
      };

    } catch (error) {
      console.error(`Error generating personalized content for ${business.name}:`, error.message);

      // Fallback to review-based content
      return this.generateFallbackContent(business);
    }
  }

  createPrompt(businessName, businessType, reviewContext) {
    return `
Negocio: ${businessName}
Tipo: ${businessType}
Reseñas de clientes: "${reviewContext}"

Basándote en las reseñas reales, genera UNA frase personalizada que mencione aspectos específicos que destacan los clientes (platos, servicios, ambiente, etc.).

Ejemplos de buenas frases:
- "especialmente por su paella y el trato familiar que mencionan los clientes"
- "sobre todo por sus cortes modernos y el ambiente acogedor"
- "particularmente por su café artesanal y la atención personalizada"

Genera SOLO la frase, sin comillas ni explicaciones adicionales.
    `.trim();
  }

  generateFallbackContent(business) {
    const businessType = this.inferBusinessType(business);
    const rating = business.googlePlaceDetails?.currentRating || business.rating || 0;

    let fallbackContent = '';

    if (rating >= 4.5) {
      fallbackContent = `especialmente por sus excelentes valoraciones de ${rating} estrellas`;
    } else if (rating >= 4.0) {
      fallbackContent = `por su buena reputación online y valoraciones positivas`;
    } else {
      fallbackContent = `por su presencia en la zona y potencial de crecimiento`;
    }

    return {
      personalizedContent: fallbackContent,
      businessName: business.name,
      businessType,
      reviewCount: (business.reviews || []).length,
      averageRating: rating,
      tokensUsed: 0,
      fallback: true
    };
  }

  inferBusinessType(business) {
    const name = business.name.toLowerCase();
    const types = business.googlePlaceDetails?.types || [];

    // Check Google Place types first
    if (types.includes('restaurant') || types.includes('food') || types.includes('meal_takeaway')) {
      return 'restaurante';
    }
    if (types.includes('hair_care') || types.includes('beauty_salon')) {
      return 'centro de belleza';
    }
    if (types.includes('gym') || types.includes('spa')) {
      return 'centro de bienestar';
    }

    // Fallback to name analysis
    if (name.includes('restaurante') || name.includes('bar') || name.includes('cafetería')) {
      return 'restaurante';
    }
    if (name.includes('peluquería') || name.includes('salón') || name.includes('belleza')) {
      return 'centro de belleza';
    }
    if (name.includes('gimnasio') || name.includes('fitness')) {
      return 'gimnasio';
    }

    return 'negocio local';
  }

  async generateBatchContent(businesses, batchSize = 5) {
    const results = [];

    for (let i = 0; i < businesses.length; i += batchSize) {
      const batch = businesses.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(businesses.length / batchSize)}`);

      const batchPromises = batch.map(business => this.generatePersonalizedContent(business));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push({
            business: batch[index],
            content: result.value
          });
        } else {
          console.error(`Failed to generate content for ${batch[index].name}:`, result.reason);
          results.push({
            business: batch[index],
            content: this.generateFallbackContent(batch[index])
          });
        }
      });

      // Rate limiting between batches
      if (i + batchSize < businesses.length) {
        await delay(1000);
      }
    }

    return results;
  }

  getUsageStats() {
    return {
      requestCount: this.requestCount,
      estimatedCost: this.requestCount * 0.002 // Approximate cost for GPT-3.5-turbo
    };
  }
}

export default MessageGenerator;