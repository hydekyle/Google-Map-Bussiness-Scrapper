export class MessageTemplate {
  constructor(options = {}) {
    this.templates = {
      default: `Hola! Soy {YOUR_NAME}, especialista en páginas web para negocios locales. He visto que {BUSINESS_NAME} tiene excelentes reseñas, {PERSONALIZED_CONTENT}. Me gustaría mostrarle cómo una página web profesional podría ayudarle a atraer aún más clientes. ¿Tendría unos minutos para una breve conversación?`,

      restaurant: `¡Hola! Soy {YOUR_NAME}, especializo en páginas web para restaurantes. He visto que {BUSINESS_NAME} tiene muy buenas valoraciones, {PERSONALIZED_CONTENT}. Creo que una página web atractiva con menú online y reservas podría ayudarles a captar más clientes. ¿Le interesaría que le muestre algunos ejemplos?`,

      beauty: `Hola! Soy {YOUR_NAME}, creo páginas web para centros de belleza y peluquerías. He notado que {BUSINESS_NAME} tiene excelente reputación, {PERSONALIZED_CONTENT}. Una página web con sistema de citas online podría ser muy beneficiosa para su negocio. ¿Podríamos hablar brevemente?`,

      formal: `Buenos días. Soy {YOUR_NAME}, desarrollador web especializado en negocios locales. He investigado sobre {BUSINESS_NAME} y he visto que {PERSONALIZED_CONTENT}. Me gustaría proponerle una solución web que podría incrementar su visibilidad online. ¿Tendría disponibilidad para una llamada breve?`,

      casual: `¡Hola! 👋 Me llamo {YOUR_NAME} y ayudo a negocios como {BUSINESS_NAME} a tener mejor presencia online. He visto que {PERSONALIZED_CONTENT}, ¡qué genial! ¿Te interesaría saber cómo una web podría ayudarte a conseguir más clientes?`
    };

    this.yourName = options.yourName || '[TU_NOMBRE]';
    this.defaultTemplate = options.defaultTemplate || 'default';
  }

  generateMessage(business, personalizedContent, templateType = null) {
    try {
      const template = this.selectTemplate(business, templateType);
      const businessName = business.name || '[NOMBRE_NEGOCIO]';

      const message = template
        .replace(/{YOUR_NAME}/g, this.yourName)
        .replace(/{BUSINESS_NAME}/g, businessName)
        .replace(/{PERSONALIZED_CONTENT}/g, personalizedContent);

      return {
        message,
        templateUsed: templateType || this.getAutoTemplate(business),
        businessName,
        personalizedContent,
        length: message.length,
        estimatedReadTime: Math.ceil(message.split(' ').length / 200) // Average reading speed
      };

    } catch (error) {
      console.error('Error generating message:', error);
      return this.generateFallbackMessage(business, personalizedContent);
    }
  }

  selectTemplate(business, templateType) {
    if (templateType && this.templates[templateType]) {
      return this.templates[templateType];
    }

    const autoTemplate = this.getAutoTemplate(business);
    return this.templates[autoTemplate] || this.templates.default;
  }

  getAutoTemplate(business) {
    const businessType = this.inferBusinessType(business);

    switch (businessType) {
      case 'restaurante':
        return 'restaurant';
      case 'centro de belleza':
      case 'peluquería':
        return 'beauty';
      default:
        return this.defaultTemplate;
    }
  }

  inferBusinessType(business) {
    const name = business.name?.toLowerCase() || '';
    const types = business.googlePlaceDetails?.types || [];

    // Check Google Place types
    if (types.includes('restaurant') || types.includes('food') || types.includes('meal_takeaway')) {
      return 'restaurante';
    }
    if (types.includes('hair_care') || types.includes('beauty_salon')) {
      return 'centro de belleza';
    }

    // Fallback to name analysis
    const restaurantKeywords = ['restaurante', 'bar', 'cafetería', 'pizzería', 'hamburguesería', 'marisquería'];
    const beautyKeywords = ['peluquería', 'salón', 'belleza', 'estética', 'spa'];

    if (restaurantKeywords.some(keyword => name.includes(keyword))) {
      return 'restaurante';
    }
    if (beautyKeywords.some(keyword => name.includes(keyword))) {
      return 'centro de belleza';
    }

    return 'negocio local';
  }

  generateFallbackMessage(business, personalizedContent) {
    const fallbackMessage = `Hola! Soy ${this.yourName}, especialista en páginas web para negocios locales. He visto que ${business.name || '[NEGOCIO]'} ${personalizedContent || 'tiene buena reputación en la zona'}. Me gustaría mostrarle cómo una página web profesional podría ayudarle a atraer más clientes. ¿Tendría unos minutos para conversar?`;

    return {
      message: fallbackMessage,
      templateUsed: 'fallback',
      businessName: business.name,
      personalizedContent,
      length: fallbackMessage.length,
      estimatedReadTime: 1,
      isFallback: true
    };
  }

  generateBulkMessages(businessesWithContent, options = {}) {
    const templateType = options.templateType;
    const results = [];

    businessesWithContent.forEach(({ business, content }) => {
      const personalizedContent = content.personalizedContent || 'tiene buena reputación';
      const messageData = this.generateMessage(business, personalizedContent, templateType);

      results.push({
        businessName: business.name,
        phoneNumber: business.phone,
        message: messageData.message,
        templateUsed: messageData.templateUsed,
        messageLength: messageData.length,
        business,
        contentData: content,
        generatedAt: new Date().toISOString()
      });
    });

    return results;
  }

  addCustomTemplate(name, template) {
    this.templates[name] = template;
  }

  setYourName(name) {
    this.yourName = name;
  }

  getAvailableTemplates() {
    return Object.keys(this.templates);
  }

  previewTemplate(templateName, sampleBusiness = null, sampleContent = null) {
    const business = sampleBusiness || {
      name: 'Restaurante La Paella',
      googlePlaceDetails: { types: ['restaurant'] }
    };

    const content = sampleContent || 'especialmente por su paella y el trato familiar';

    return this.generateMessage(business, content, templateName);
  }

  validateMessage(message) {
    const warnings = [];

    if (message.length > 1600) {
      warnings.push('Message is too long for WhatsApp (>1600 characters)');
    }

    if (message.includes('{') || message.includes('}')) {
      warnings.push('Message contains unreplaced placeholders');
    }

    if (message.includes('[TU_NOMBRE]') || message.includes('[NOMBRE_NEGOCIO]')) {
      warnings.push('Message contains unreplaced fallback values');
    }

    const spamKeywords = ['GRATIS', 'OFERTA LIMITADA', '100% GARANTIZADO', 'URGENTE'];
    const hasSpamKeywords = spamKeywords.some(keyword =>
      message.toUpperCase().includes(keyword)
    );

    if (hasSpamKeywords) {
      warnings.push('Message contains potential spam keywords');
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      length: message.length,
      wordCount: message.split(' ').length
    };
  }

  getStats(messages) {
    const templateUsage = {};
    let totalLength = 0;
    let validMessages = 0;

    messages.forEach(msg => {
      const template = msg.templateUsed || 'unknown';
      templateUsage[template] = (templateUsage[template] || 0) + 1;
      totalLength += msg.messageLength || 0;

      const validation = this.validateMessage(msg.message);
      if (validation.isValid) validMessages++;
    });

    return {
      totalMessages: messages.length,
      validMessages,
      invalidMessages: messages.length - validMessages,
      averageLength: Math.round(totalLength / messages.length),
      templateUsage,
      successRate: ((validMessages / messages.length) * 100).toFixed(2) + '%'
    };
  }
}

export default MessageTemplate;