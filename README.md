# 🚀 Local Business Lead Generator

Sistema automatizado de generación de leads para negocios locales usando scraping de Google Maps, API de Google Places y mensajería personalizada via WhatsApp.

## 📋 Características

- **Scraping de Google Maps**: Extrae información de negocios locales
- **Enriquecimiento de datos**: Usa Google Places API para obtener reseñas y detalles
- **Mensajes personalizados**: Genera contenido único con IA basado en reseñas reales
- **Envío masivo WhatsApp**: Automatiza el envío de mensajes personalizados
- **Control de costos**: Optimizado para mantener costos bajos (<1 céntimo por 50 leads)

## 🛠️ Instalación

1. **Clona o descarga el proyecto**:
```bash
cd local-business-lead-generator
```

2. **Instala las dependencias**:
```bash
npm install
```

3. **Configura las variables de entorno**:
```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:
```env
# APIs requeridas
GOOGLE_PLACES_API_KEY=tu_api_key_de_google_places
OPENAI_API_KEY=tu_api_key_de_openai

# Tu información
YOUR_NAME=Tu Nombre

# Configuración de búsqueda
SEARCH_LOCATION=Madrid, Spain
BUSINESS_TYPES=restaurant,hair_care,beauty_salon
MAX_RESULTS=50
```

## 🔑 APIs Necesarias

### Google Places API
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la API de Places
4. Crea una clave API con restricciones apropiadas

### OpenAI API
1. Ve a [OpenAI Platform](https://platform.openai.com/)
2. Crea una cuenta y configura billing
3. Genera una API key

## 🚀 Uso

### Uso básico (sin envío de mensajes)
```bash
npm start
```

### Búsqueda específica por tipo
```bash
npm start --type restaurants --location "Barcelona, Spain"
npm start --type beauty --location "Valencia, Spain"
npm start --type fitness
```

### Envío automático de mensajes WhatsApp
```bash
npm start --send-messages
```

⚠️ **IMPORTANTE**: La primera vez que uses `--send-messages`, tendrás que escanear un código QR con WhatsApp Web.

### Consultas personalizadas
```bash
npm start --queries "pizzerías,sushi,hamburgueserías" --location "Sevilla"
```

## 📊 Proceso de Trabajo

1. **Scraping**: Busca negocios en Google Maps
2. **Enriquecimiento**: Obtiene reseñas y detalles via Google Places API
3. **Filtrado**: Selecciona negocios de calidad (rating, reseñas, teléfono)
4. **Personalización**: Genera contenido único basado en reseñas
5. **Mensajería**: Envía mensajes personalizados via WhatsApp (opcional)

## 📁 Estructura de Archivos

```
src/
├── main.js                 # Script principal y CLI
├── googleMapsScraper.js     # Scraper de Google Maps
├── googlePlacesApi.js       # Integración con Google Places API
├── messageGenerator.js      # Generación de contenido con IA
├── whatsappSender.js        # Envío de mensajes WhatsApp
├── messageTemplate.js       # Templates de mensajes
└── config.js               # Configuración centralizada

data/                       # Datos extraídos y procesados
logs/                       # Logs de WhatsApp y errores
output/                     # Resultados finales
```

## 🎯 Tipos de Negocio Soportados

- **Restaurantes**: `restaurants`
- **Centros de belleza**: `beauty`
- **Gimnasios**: `fitness`

Cada tipo tiene templates de mensaje específicos optimizados.

## 💰 Control de Costos

El sistema está optimizado para minimizar costos:

- **Google Places API**: ~$0.017 por consulta de detalles
- **OpenAI API**: ~$0.002 por mensaje personalizado
- **Total estimado**: <$0.01 por 50 leads de calidad

## ⚙️ Configuración Avanzada

### Templates de Mensaje Personalizados

Puedes crear templates personalizados en `src/messageTemplate.js`:

```javascript
this.templates.custom = `Tu mensaje personalizado aquí con {BUSINESS_NAME} y {PERSONALIZED_CONTENT}`;
```

### Rate Limiting

Ajusta los límites en `.env`:
```env
REQUESTS_PER_MINUTE=10
MESSAGE_DELAY=5000
MAX_MESSAGES_PER_HOUR=50
```

### Filtros de Calidad

```env
MIN_RATING=4.0
MIN_REVIEWS=10
REQUIRE_PHONE=true
```

## 🔧 Solución de Problemas

### Error de autenticación WhatsApp
- Elimina la carpeta `.wwebjs_auth/`
- Ejecuta de nuevo con `--send-messages`

### Rate limiting de Google
- Reduce `REQUESTS_PER_MINUTE`
- Aumenta delays en la configuración

### Mensajes muy robóticos
- Ajusta la temperatura del modelo: `OPENAI_TEMPERATURE=0.8`
- Personaliza los templates en `messageTemplate.js`

## 📈 Mejores Prácticas

1. **Comienza sin `--send-messages`** para revisar los resultados
2. **Revisa los datos** en `/data/` antes del envío masivo
3. **Respeta los rate limits** para evitar bloqueos
4. **Personaliza templates** según tu negocio
5. **Monitorea costos** regularmente

## ⚖️ Consideraciones Legales

- ✅ Respeta las políticas de WhatsApp Business
- ✅ Cumple con GDPR/LOPD para datos personales
- ✅ No hagas spam - personaliza siempre los mensajes
- ✅ Ofrece opt-out claro en tus mensajes

## 📞 Soporte

Para problemas o mejoras, revisa:
1. Los logs en `/logs/`
2. Los archivos de salida en `/output/`
3. La configuración en `.env`

---

**⚠️ Disclaimer**: Usa este tool de forma responsable y respetando las términos de servicio de todas las plataformas involucradas.