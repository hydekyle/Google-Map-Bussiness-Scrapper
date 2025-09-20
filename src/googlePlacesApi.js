import axios from 'axios';
import delay from 'delay';

export class GooglePlacesAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://maps.googleapis.com/maps/api/place';
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }

  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < 100) {
      await delay(100 - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async findPlaceByName(name, location) {
    await this.rateLimit();

    try {
      const query = `${name} ${location}`;
      const response = await axios.get(`${this.baseUrl}/findplacefromtext/json`, {
        params: {
          input: query,
          inputtype: 'textquery',
          fields: 'place_id,name,formatted_address,rating,user_ratings_total',
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK' && response.data.candidates.length > 0) {
        return response.data.candidates[0];
      }

      return null;
    } catch (error) {
      console.error(`Error finding place for ${name}:`, error.message);
      return null;
    }
  }

  async getPlaceDetails(placeId) {
    await this.rateLimit();

    try {
      const response = await axios.get(`${this.baseUrl}/details/json`, {
        params: {
          place_id: placeId,
          fields: 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,reviews,types,opening_hours,price_level',
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK') {
        return response.data.result;
      }

      return null;
    } catch (error) {
      console.error(`Error getting place details for ${placeId}:`, error.message);
      return null;
    }
  }

  async getReviews(placeId, maxReviews = 5) {
    const details = await this.getPlaceDetails(placeId);

    if (!details || !details.reviews) {
      return [];
    }

    return details.reviews
      .slice(0, maxReviews)
      .map(review => ({
        author: review.author_name,
        rating: review.rating,
        text: review.text,
        time: review.time,
        relative_time: review.relative_time_description
      }));
  }

  async searchNearby(location, radius = 5000, type = 'restaurant') {
    await this.rateLimit();

    try {
      const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, {
        params: {
          location: location,
          radius: radius,
          type: type,
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK') {
        return response.data.results;
      }

      return [];
    } catch (error) {
      console.error(`Error searching nearby places:`, error.message);
      return [];
    }
  }

  async enrichBusinessData(business) {
    try {
      // Always try to find the place by name first, since scraped placeId is not reliable
      const place = await this.findPlaceByName(business.name, business.address);
      
      if (!place) {
        console.log(`No place found for ${business.name}`);
        return { ...business, enriched: false };
      }

      const placeId = place.place_id;

      // Get detailed information
      const details = await this.getPlaceDetails(placeId);

      if (!details) {
        console.log(`No details found for ${business.name}`);
        return { ...business, enriched: false };
      }

      // Get reviews
      const reviews = details.reviews || [];

      return {
        ...business,
        placeId,
        googlePlaceDetails: {
          types: details.types || [],
          openingHours: details.opening_hours?.weekday_text || [],
          priceLevel: details.price_level,
          website: details.website || business.website,
          phone: details.formatted_phone_number || business.phone,
          totalReviews: details.user_ratings_total || business.reviewCount,
          currentRating: details.rating || business.rating
        },
        reviews: reviews.map(review => ({
          author: review.author_name,
          rating: review.rating,
          text: review.text,
          relativeTime: review.relative_time_description
        })),
        enriched: true,
        enrichedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error enriching business data for ${business.name}:`, error.message);
      return { ...business, enriched: false, error: error.message };
    }
  }

  getUsageStats() {
    return {
      requestCount: this.requestCount,
      estimatedCost: this.requestCount * 0.017 // $0.017 per request for Place Details
    };
  }
}

export default GooglePlacesAPI;